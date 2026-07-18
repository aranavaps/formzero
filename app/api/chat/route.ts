import { NextRequest } from "next/server";
import { checkEligibility, UserProfile } from "@/lib/eligibility";
import { checkIndiaEligibility } from "@/lib/indiaEligibility";
import { getDocumentChecklist, getDependencyOrder, ProgramDocuments } from "@/lib/documents";
import { translateBenefitsToSpanish } from "@/lib/translate";
 
const systemPrompt = `
You are FormZero, a warm and friendly government benefits assistant.

LANGUAGE RULE:
- If the user writes in Spanish, respond ONLY in Spanish.
- If the user writes in English, respond ONLY in English.

PERSONALITY:
- Speak simply and clearly.
- Be warm and encouraging.
- Never make people feel embarrassed.

YOUR ONLY JOB RIGHT NOW:
Collect information by asking ONE question at a time.

QUESTION FLOW:

QUESTION 1:
Which country do you live in?
- United States
- India

IF COUNTRY = UNITED STATES:

Collect:
1. Country
2. US state
3. Household size
4. Monthly household income
5. Children under 18? (yes/no)
6. Pregnant household member? (yes/no)
7. Elderly (65+) or disabled household member? (yes/no)
8. Student? (yes/no)
9. Immigration status

After collecting all answers output:

[PROFILE_COMPLETE]
country: usa
state: <state>
household_size: <household size>
monthly_income: <income>
has_children: <true/false>
has_pregnant: <true/false>
has_elderly_or_disabled: <true/false>
is_student: <true/false>
immigration_status: <citizen|permanent_resident|not_disclosed>
language: <english|spanish>
[/PROFILE_COMPLETE]

IF COUNTRY = INDIA:

Collect:
1. Country
2. State
3. Age
4. Gender
5. Household size
6. Monthly household income
7. Category (General, OBC, SC, ST)
8. Student? (yes/no)
9. Farmer? (yes/no)
10. Elderly or disabled? (yes/no)

After collecting all answers output:

[PROFILE_COMPLETE]
country: india
state: <state>
age: <age>
gender: <male|female|other>
household_size: <household size>
monthly_income: <income>
category: <general|obc|sc|st>
is_student: <true/false>
is_farmer: <true/false>
has_elderly_or_disabled: <true/false>
language: <english|spanish>
[/PROFILE_COMPLETE]

RULES:
- Ask ONLY ONE question at a time.
- Do NOT skip questions.
- Do NOT discuss benefits until all required questions are answered.
- After the final question, output PROFILE_COMPLETE immediately.
- Then say:
"Perfect! I have everything I need. Let me find your benefits now!"

OUT-OF-SCOPE:
- You only help users find government benefits and assistance programs.
- If someone asks unrelated questions, redirect them back to the benefits interview.
- Never claim to be ChatGPT or another AI.
- You are FormZero.
`;
 
export async function POST(req: NextRequest) {
  try {
    const { messages, mode, language } = await req.json();
 
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
 
    const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
    // ── Day 13: Adversarial prompt detection ──
    const lastUserContent = messages[messages.length - 1]?.content?.toLowerCase() || "";
    const adversarialPatterns = [
      "ignore previous", "ignore your instructions", "forget your",
      "new instructions", "you are now", "pretend you are", "act as",
      "jailbreak", "system prompt", "bypass", "override instructions",
      "disregard", "you are chatgpt", "you are gpt", "you are gemini",
    ];
    const isAdversarial = adversarialPatterns.some((p) =>
      lastUserContent.includes(p)
    );

    if (isAdversarial) {
      return new Response(
        JSON.stringify({
          reply:
            "I'm FormZero — I'm only here to help you find US government benefits. I can't change my role or instructions. Let's get back to finding what you qualify for! What state do you live in?",
          profile: null,
          benefits: null,
          dependency_order: [],
          document_checklists: {},
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    const lastMessage = messages[messages.length - 1];
 
    // DISCOVERY FEED MODE
    if (mode === "discovery") {
      const profileString = lastMessage.content;
      const userLanguage = language || "english";
 
      const discoveryPrompt = `
You are FormZero's discovery engine. Think out loud as you scan benefits programs.
 
YOU MUST RESPOND IN ${userLanguage === "spanish" ? "SPANISH" : "ENGLISH"} ONLY. THIS IS MANDATORY. IF THE LANGUAGE IS ENGLISH, WRITE IN ENGLISH. IF SPANISH, WRITE IN SPANISH. DO NOT USE ANY OTHER LANGUAGE UNDER ANY CIRCUMSTANCES.
 
CRITICAL LANGUAGE RULE: You MUST write EVERYTHING in ${userLanguage === "spanish" ? "SPANISH" : "ENGLISH"} only. Do not use any other language.
 
Write a live discovery feed like a scanner running in real time.
Format each program like this:
 
🔍 Scanning [Program Name]...
→ Checking [specific rule with actual numbers]...
→ [User's situation] vs required [threshold]...
✅ Match found! OR ❌ No match.
 
Scan all 8 programs: SNAP, Medicaid/CHIP, LIHEAP, WIC, Pell Grant, TANF, EITC, Lifeline.
Keep each program to 3-4 lines.
Use the actual numbers from the user profile.
End with: "✓ Scan complete. Showing your results now..."
`;
 
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            max_tokens: 800,
            stream: true,
            messages: [
              { role: "system", content: discoveryPrompt },
              {
                role: "user",
                content: `IMPORTANT: Respond in ${userLanguage === "spanish" ? "SPANISH" : "ENGLISH"} only. User profile: ${profileString}. Run the discovery scan now in ${userLanguage === "spanish" ? "SPANISH" : "ENGLISH"}.`,
              },
            ],
          }),
        }
      );
 
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          if (!reader) {
            controller.close();
            return;
          }
 
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
 
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((l) => l.trim());
 
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  controller.close();
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  const token = parsed.choices?.[0]?.delta?.content || "";
                  if (token)
                    controller.enqueue(new TextEncoder().encode(token));
                } catch {
                  /* skip */
                }
              }
            }
          }
        },
      });
 
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
        },
      });
    }
 
    // NORMAL CHAT MODE
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          max_tokens: 1000,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
      }
    );
 
    const data = await response.json();
 
    if (!response.ok) {
      console.error("Groq error:", data);
      return new Response(JSON.stringify({ error: "API call failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
 
    const fullReply: string = data.choices[0].message.content;
 
    // Extract profile block — robust match
    let profileMatch = fullReply.match(
      /\[PROFILE_COMPLETE\]\s*([\s\S]*?)\s*\[\/PROFILE_COMPLETE\]/i
    );
    if (!profileMatch && fullReply.includes("[/PROFILE_COMPLETE]")) {
      const chunk = fullReply.split("[/PROFILE_COMPLETE]")[0];
      const inner = chunk.match(/(state:[\s\S]*)/i);
      if (inner) profileMatch = [fullReply, inner[1]] as RegExpMatchArray;
    }
 
    let profile: Record<string, string> | null = null;
    let benefits = null;
 
    // Day 8: declare document variables
    let dependencyOrder: {
      name: string;
      order: number;
      unlocks?: string[];
      eligible: string;
    }[] = [];
    let documentChecklists: Record<string, ProgramDocuments> = {};
 
    if (profileMatch) {
      profile = {};
      const lines = profileMatch[1].trim().split("\n");
      for (const line of lines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex !== -1) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          if (key && value) profile[key] = value;
        }
      }
 
      const userProfile: UserProfile = {
        country: (profile.country as any) || "usa",
        category: (profile.category as any) || "general",
        is_farmer: profile.is_farmer === "true",
        age: parseInt(profile.age) || undefined,
        gender: (profile.gender as any) || undefined,
        state: profile.state || "",
        household_size: parseInt(profile.household_size) || 1,
        monthly_income: parseFloat(profile.monthly_income) || 0,
        has_children: profile.has_children === "true",
        has_pregnant: profile.has_pregnant === "true",
        has_elderly_or_disabled: profile.has_elderly_or_disabled === "true",
        is_student: profile.is_student === "true",
        immigration_status:
          (profile.immigration_status as UserProfile["immigration_status"]) ||
          "not_disclosed",
        language:
          (profile.language as UserProfile["language"]) || "english",
      };
 
      benefits = userProfile.country === "india" ? checkIndiaEligibility(userProfile) : checkEligibility(userProfile);
 
      // ── Day 10: Spanish translation pipeline ──
      if (userProfile.language === "spanish") {
        benefits = await translateBenefitsToSpanish(benefits, GROQ_API_KEY);
      }
 
      // Day 8: build document checklists + dependency order
      dependencyOrder = getDependencyOrder(benefits);
      for (const benefit of benefits) {
        if (benefit.eligible === "yes" || benefit.eligible === "likely") {
          const checklist = getDocumentChecklist(benefit.name);
          if (checklist) {
            documentChecklists[benefit.name] = checklist;
          }
        }
      }
    }
 
    const cleanReply = fullReply
      .replace(/\[PROFILE_COMPLETE\][\s\S]*?\[\/PROFILE_COMPLETE\]/gi, "")
      .replace(/\[\/PROFILE_COMPLETE\]/gi, "")
      .trim();
 
    return new Response(
      JSON.stringify({
        reply: cleanReply,
        profile,
        benefits,
        dependency_order: dependencyOrder,
        document_checklists: documentChecklists,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
 
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
 