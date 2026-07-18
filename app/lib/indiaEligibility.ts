import { UserProfile, BenefitResult } from "./eligibility";

export function checkIndiaEligibility(profile: UserProfile): BenefitResult[] {
  const results: BenefitResult[] = [];
  const income = profile.monthly_income;

  // 1. PM-KISAN (Pradhan Mantri Kisan Samman Nidhi)
  const isKisanEligible = profile.is_farmer === true;
  results.push({
    name: "PM-KISAN (Farmer Income Support)",
    eligible: isKisanEligible ? "yes" : "no",
    confidence: isKisanEligible ? 90 : 10,
    reason: isKisanEligible
      ? "As a farmer, you are eligible for income support of ₹6,000 per year."
      : "PM-KISAN is available only for landholding farmer families.",
    annual_value: "₹6,000/year",
    annual_value_number: isKisanEligible ? 6000 : 0,
    apply_url: "https://pmkisan.gov.in/",
    deadline: "Rolling — apply anytime",
    source: {
      document: "PM-KISAN Scheme Guidelines",
      rule: "All landholding farmers' families are eligible for ₹6,000 per year.",
      url: "https://pmkisan.gov.in/",
    },
  });

  // 2. Ayushman Bharat (PM-JAY)
  const isAyushmanEligible = income < 10000 || profile.category === "sc" || profile.category === "st";
  results.push({
    name: "Ayushman Bharat (PM-JAY Health Cover)",
    eligible: isAyushmanEligible ? "yes" : income < 20000 ? "likely" : "unlikely",
    confidence: isAyushmanEligible ? 85 : income < 20000 ? 50 : 20,
    reason: isAyushmanEligible
      ? "Based on your income and category, you qualify for ₹5 Lakhs/year health insurance cover."
      : "Ayushman Bharat targets poor, deprived rural families and identified occupational categories of urban workers' families.",
    annual_value: "Up to ₹5,00,000/year cover",
    annual_value_number: isAyushmanEligible ? 500000 : 0,
    apply_url: "https://pmjay.gov.in/",
    deadline: "Rolling — check eligibility online",
    source: {
      document: "Ayushman Bharat Pradhan Mantri Jan Arogya Yojana",
      rule: "Provides a cover of ₹5,00,000 per family per year for secondary and tertiary care hospitalization.",
      url: "https://pmjay.gov.in/",
    },
  });

  // 3. PM Awas Yojana (PMAY)
  const isPmayEligible = income < 25000;
  results.push({
    name: "PM Awas Yojana (Housing Subsidy)",
    eligible: isPmayEligible ? "yes" : income < 50000 ? "likely" : "no",
    confidence: isPmayEligible ? 80 : income < 50000 ? 60 : 10,
    reason: isPmayEligible
      ? `Your monthly income of ₹${income} falls under the EWS/LIG category, making you eligible for home loan subsidies.`
      : `Your income exceeds the typical Economic Weaker Section (EWS) or Low Income Group (LIG) thresholds for maximum subsidy.`,
    annual_value: "Up to ₹2.67 Lakhs subsidy",
    annual_value_number: isPmayEligible ? 267000 : 0,
    apply_url: "https://pmaymis.gov.in/",
    deadline: "Subject to scheme extension",
    source: {
      document: "Pradhan Mantri Awas Yojana Guidelines",
      rule: "Credit Linked Subsidy Scheme (CLSS) for EWS/LIG with household income up to ₹6,00,000 annually.",
      url: "https://pmaymis.gov.in/",
    },
  });

  // 4. National Scholarship Portal (NSP)
  const isScholarshipEligible = profile.is_student && income < 20000;
  results.push({
    name: "National Scholarship Portal",
    eligible: isScholarshipEligible ? "yes" : profile.is_student ? "likely" : "no",
    confidence: isScholarshipEligible ? 85 : profile.is_student ? 50 : 5,
    reason: isScholarshipEligible
      ? "As a student from a lower-income household, you may be eligible for pre-matric or post-matric scholarships."
      : profile.is_student
      ? "Students can apply for various merit and means-based scholarships."
      : "You must be an enrolled student to apply for educational scholarships.",
    annual_value: "₹5,000 - ₹20,000/year",
    annual_value_number: isScholarshipEligible ? 12000 : 0,
    apply_url: "https://scholarships.gov.in/",
    deadline: "Varies by specific scheme (typically Oct/Nov)",
    source: {
      document: "National Scholarship Portal",
      rule: "Various scholarships are available for minority, SC/ST/OBC, and economically weaker section students.",
      url: "https://scholarships.gov.in/",
    },
  });

  // 5. Indira Gandhi National Old Age Pension Scheme (IGNOAPS)
  const isElderlyEligible = (profile.age !== undefined && profile.age >= 60) || profile.has_elderly_or_disabled;
  const isPensionEligible = isElderlyEligible && income < 10000;
  
  results.push({
    name: "National Old Age Pension Scheme",
    eligible: isPensionEligible ? "yes" : isElderlyEligible ? "likely" : "no",
    confidence: isPensionEligible ? 80 : isElderlyEligible ? 50 : 5,
    reason: isPensionEligible
      ? "You qualify for a monthly pension based on age and income criteria."
      : isElderlyEligible
      ? "You meet the age requirement, but state-specific income limits will determine final eligibility."
      : "This scheme is restricted to elderly citizens (60+ years) living below the poverty line.",
    annual_value: "₹2,400 - ₹12,000/year",
    annual_value_number: isPensionEligible ? 6000 : 0,
    apply_url: "https://nsap.nic.in/",
    deadline: "Rolling — apply anytime",
    source: {
      document: "National Social Assistance Programme (NSAP)",
      rule: "Provides monthly pension to BPL individuals aged 60 years or above.",
      url: "https://nsap.nic.in/",
    },
  });

  return results;
}