import { UserProfile, BenefitResult } from "./eligibility";

// ─── India Federal Poverty Line Equivalent (BPL monthly income threshold) ───
// BPL threshold: ₹2,500/month rural, ₹3,000/month urban (Tendulkar Committee)
// LIG: up to ₹25,000/month household income
// EWS: up to ₹8,333/month (₹1L/year household income)
// MIG-1: ₹25,000–₹41,667/month
// MIG-2: ₹41,667–₹66,667/month

export function checkIndiaEligibility(profile: UserProfile): BenefitResult[] {
  const results: BenefitResult[] = [];
  const income = profile.monthly_income;
  const annualIncome = income * 12;
  const isBPL = income < 3000;
  const isEWS = annualIncome <= 100000; // ₹1L/year
  const isLIG = annualIncome <= 300000; // ₹3L/year
  const isMIG1 = annualIncome > 300000 && annualIncome <= 600000;
  const isSCOrST = profile.category === "sc" || profile.category === "st";
  const isOBC = profile.category === "obc";

  // ─── 1. PM-KISAN (Farmer Income Support) ───────────────────────────────────
  // Eligibility: All landholding farmer families. Excludes income-tax payers,
  // constitutional post holders, retired govt employees (pension > ₹10K/month).
  const isKisanEligible = profile.is_farmer === true && income < 50000;
  results.push({
    name: "PM-KISAN (Farmer Income Support)",
    eligible: isKisanEligible ? "yes" : profile.is_farmer ? "likely" : "no",
    confidence: isKisanEligible ? 92 : profile.is_farmer ? 60 : 5,
    reason: isKisanEligible
      ? "As a landholding farmer family, you are eligible for ₹6,000 per year (₹2,000 per installment, 3 times/year) directly into your bank account."
      : profile.is_farmer
      ? "Farmers with income above ₹50,000/month or who are income-tax payers are excluded."
      : "PM-KISAN is only for landholding farmer families.",
    annual_value: "₹6,000/year",
    annual_value_number: isKisanEligible ? 6000 : 0,
    apply_url: "https://pmkisan.gov.in/",
    deadline: "Rolling — apply anytime via CSC or pmkisan.gov.in",
    source: {
      document: "PM-KISAN Scheme Guidelines 2019",
      rule: "All landholding farmer families receive ₹6,000/year in 3 equal installments of ₹2,000. 7th installment onwards, e-KYC mandatory.",
      url: "https://pmkisan.gov.in/",
    },
  });

  // ─── 2. Ayushman Bharat PM-JAY ──────────────────────────────────────────────
  // Eligibility: Based on SECC 2011 deprivation criteria for rural, occupational
  // criteria for urban. Income proxy: BPL/low income families.
  // Expanded in 2024 to cover all senior citizens 70+ regardless of income.
  const isAyushmanSenior = (profile.age !== undefined && profile.age >= 70);
  const isAyushmanEligible = isBPL || isSCOrST || isAyushmanSenior || income < 8000;
  results.push({
    name: "Ayushman Bharat PM-JAY (Health Insurance)",
    eligible: isAyushmanEligible ? "yes" : income < 15000 ? "likely" : "unlikely",
    confidence: isAyushmanEligible ? 88 : income < 15000 ? 55 : 25,
    reason: isAyushmanEligible
      ? isAyushmanSenior
        ? "Citizens aged 70+ are now eligible under the expanded PM-JAY 2024 for ₹5 Lakh/year health cover."
        : "Based on income and/or category, you qualify for ₹5 Lakh/year cashless health coverage at empanelled hospitals."
      : "PM-JAY is based on SECC-2011 deprivation and occupational criteria. Check your eligibility on the PMJAY portal.",
    annual_value: "Up to ₹5,00,000/year",
    annual_value_number: isAyushmanEligible ? 500000 : 0,
    apply_url: "https://beneficiary.nha.gov.in/",
    deadline: "Rolling — check eligibility at mera.pmjay.gov.in",
    source: {
      document: "Ayushman Bharat Pradhan Mantri Jan Arogya Yojana (AB PM-JAY)",
      rule: "Health cover of ₹5,00,000 per family per year for secondary and tertiary care hospitalization. Extended to all 70+ citizens from Sept 2024.",
      url: "https://pmjay.gov.in/",
    },
  });

  // ─── 3. PM Awas Yojana - Gramin & Urban (PMAY-G / PMAY-U) ──────────────────
  // PMAY-G: BPL rural families without pucca house
  // PMAY-U EWS/LIG: Annual income up to ₹3L (EWS) or ₹6L (LIG), subsidy on home loan
  const isPmayEligible = isEWS || (isLIG && income < 25000);
  const isPmayLikely = annualIncome <= 600000 && !isPmayEligible;
  results.push({
    name: "PM Awas Yojana (Housing Subsidy)",
    eligible: isPmayEligible ? "yes" : isPmayLikely ? "likely" : "no",
    confidence: isPmayEligible ? 80 : isPmayLikely ? 60 : 10,
    reason: isPmayEligible
      ? `Annual income ₹${annualIncome.toLocaleString("en-IN")} falls under EWS/LIG. You qualify for home loan interest subsidy of up to ₹2.67 Lakh under CLSS.`
      : isPmayLikely
      ? `Your income may qualify under MIG category for reduced subsidy. Annual household income must be below ₹18L for any benefit.`
      : `Your income exceeds PMAY limits (EWS: ≤₹3L/year, LIG: ≤₹6L/year, MIG-1: ≤₹12L/year).`,
    annual_value: "Up to ₹2.67 Lakhs subsidy",
    annual_value_number: isPmayEligible ? 267000 : 0,
    apply_url: "https://pmaymis.gov.in/",
    deadline: "Check current scheme status — PMAY-U extended to 2024-25",
    source: {
      document: "PMAY Urban — Credit Linked Subsidy Scheme (CLSS)",
      rule: "EWS: annual income ≤₹3L, subsidy 6.5% on ₹6L loan. LIG: ≤₹6L, subsidy 6.5% on ₹6L. MIG-1: ≤₹12L, 4% on ₹9L. MIG-2: ≤₹18L, 3% on ₹12L.",
      url: "https://pmaymis.gov.in/",
    },
  });

  // ─── 4. National Scholarship Portal (NSP) ─────────────────────────────────
  // Pre-matric: family income < ₹2.5L/year
  // Post-matric: income < ₹2.5L/year (SC/ST), ₹2.5L (OBC), ₹6L (Minority)
  const isScholarshipEligible = profile.is_student && (isSCOrST || isOBC || annualIncome < 250000);
  const isScholarshipLikely = profile.is_student && annualIncome < 600000;
  results.push({
    name: "National Scholarship Portal (NSP)",
    eligible: isScholarshipEligible ? "yes" : isScholarshipLikely ? "likely" : "no",
    confidence: isScholarshipEligible ? 88 : isScholarshipLikely ? 50 : 5,
    reason: isScholarshipEligible
      ? `As a ${isSCOrST ? "SC/ST" : isOBC ? "OBC" : "low-income"} student, you are eligible for pre/post-matric scholarships of ₹5,000–₹20,000/year.`
      : isScholarshipLikely
      ? "Students with family income below ₹6L/year may qualify for minority or merit-cum-means scholarships."
      : "Must be an enrolled student from an eligible category to apply for NSP scholarships.",
    annual_value: "₹5,000 – ₹20,000/year",
    annual_value_number: isScholarshipEligible ? 12000 : 0,
    apply_url: "https://scholarships.gov.in/",
    deadline: "Typically Aug–Nov each year. Check NSP portal.",
    source: {
      document: "National Scholarship Portal — Ministry of Minority Affairs / MoSJE / MoE",
      rule: "Pre-matric income limit: ₹2.5L/year (SC/ST). Post-matric: ₹2.5L (SC/ST), ₹1L (OBC), ₹6L (Minority).",
      url: "https://scholarships.gov.in/",
    },
  });

  // ─── 5. Indira Gandhi National Old Age Pension (IGNOAPS / NSAP) ───────────
  // Age 60–79: ₹300/month central share (states add more)
  // Age 80+: ₹500/month (Indira Gandhi National Widows Pension also ₹500/month)
  const isElderlyAge = profile.age !== undefined && profile.age >= 60;
  const isPensionEligible = (isElderlyAge || profile.has_elderly_or_disabled) && (isBPL || income < 5000);
  const pensionAmount = profile.age !== undefined && profile.age >= 80 ? 6000 : 3600;
  results.push({
    name: "National Old Age Pension (IGNOAPS/NSAP)",
    eligible: isPensionEligible ? "yes" : isElderlyAge ? "likely" : "no",
    confidence: isPensionEligible ? 82 : isElderlyAge ? 50 : 5,
    reason: isPensionEligible
      ? `You qualify for ₹300–₹500/month central pension plus state top-up. Eligibility: age 60+ and BPL status.`
      : isElderlyAge
      ? "You meet the age requirement. BPL status (state list) determines final eligibility."
      : "Restricted to BPL citizens aged 60+.",
    annual_value: "₹3,600 – ₹6,000/year (central share; states often double this)",
    annual_value_number: isPensionEligible ? pensionAmount : 0,
    apply_url: "https://nsap.nic.in/",
    deadline: "Rolling — apply via District Social Welfare Office or Common Service Centre",
    source: {
      document: "National Social Assistance Programme (NSAP) Guidelines",
      rule: "IGNOAPS: ₹300/month for 60–79 yrs; ₹500/month for 80+ years BPL beneficiaries. States add top-up.",
      url: "https://nsap.nic.in/",
    },
  });

  // ─── 6. MGNREGS (Mahatma Gandhi National Rural Employment Guarantee) ───────
  // Eligibility: Rural households — any adult member may apply for 100 days/year
  // Wage: ₹228–₹357/day depending on state (as of 2024)
  const isMgnregsEligible = income < 20000; // Proxy for rural/low-income
  results.push({
    name: "MGNREGS (Rural Employment Guarantee)",
    eligible: isMgnregsEligible ? "yes" : "unlikely",
    confidence: isMgnregsEligible ? 78 : 20,
    reason: isMgnregsEligible
      ? "Any adult rural household member can demand up to 100 days of wage employment per year at ₹228–₹357/day (state-specific rate)."
      : "MGNREGS targets rural households. If you are in a rural area, you are entitled regardless of income.",
    annual_value: "Up to ₹35,700/year (100 days × ₹357)",
    annual_value_number: isMgnregsEligible ? 22800 : 0,
    apply_url: "https://nrega.nic.in/",
    deadline: "Rolling — register at local Gram Panchayat",
    source: {
      document: "MGNREGA Act 2005 — Ministry of Rural Development",
      rule: "Every rural household has the right to at least 100 days of guaranteed wage employment per financial year at notified state-specific wages.",
      url: "https://nrega.nic.in/",
    },
  });

  // ─── 7. Pradhan Mantri Ujjwala Yojana (PMUY) ──────────────────────────────
  // Free LPG connection + ₹1,600 financial assistance for BPL women
  // Extended Phase 2: any woman not having LPG connection (priority: BPL/SC/ST/PMAY)
  const isUjjwalaEligible = (profile.gender === "female" || !profile.gender) && (isBPL || isSCOrST);
  results.push({
    name: "PM Ujjwala Yojana (Free LPG Connection)",
    eligible: isUjjwalaEligible ? "yes" : income < 15000 ? "likely" : "unlikely",
    confidence: isUjjwalaEligible ? 82 : income < 15000 ? 50 : 20,
    reason: isUjjwalaEligible
      ? "You qualify for a free LPG cooking gas connection with ₹1,600 financial assistance under PMUY Phase 2."
      : "PMUY Phase 2 is available to any woman without a gas connection. Priority for BPL, SC/ST, PMAY beneficiaries.",
    annual_value: "₹1,600 one-time + subsidized refills",
    annual_value_number: isUjjwalaEligible ? 1600 : 0,
    apply_url: "https://pmuy.gov.in/",
    deadline: "Rolling — apply at nearest LPG distributor or online",
    source: {
      document: "Pradhan Mantri Ujjwala Yojana Phase 2",
      rule: "Free LPG connection to BPL women. Phase 2 extended to all women without gas connection with priority for vulnerable categories.",
      url: "https://pmuy.gov.in/",
    },
  });

  // ─── 8. PM Jan Dhan Yojana (Financial Inclusion) ──────────────────────────
  // Zero-balance account with ₹10,000 overdraft facility, ₹2L accident insurance,
  // ₹30,000 life cover (for those enrolled before Jan 26 2015)
  const isJanDhanEligible = income < 25000;
  results.push({
    name: "PM Jan Dhan Yojana (Bank Account + Benefits)",
    eligible: isJanDhanEligible ? "yes" : "likely",
    confidence: isJanDhanEligible ? 85 : 60,
    reason: "Any Indian citizen can open a zero-balance Jan Dhan account at any bank/post office with free RuPay debit card, ₹10,000 overdraft, ₹2 Lakh accident insurance, and direct benefit transfer access.",
    annual_value: "₹2,00,000 accident insurance + ₹10,000 overdraft",
    annual_value_number: isJanDhanEligible ? 10000 : 5000,
    apply_url: "https://pmjdy.gov.in/",
    deadline: "Rolling — apply at any bank branch or Business Correspondent",
    source: {
      document: "Pradhan Mantri Jan Dhan Yojana (PMJDY) Guidelines",
      rule: "Zero balance account for all Indian citizens. Includes RuPay card, ₹10,000 OD, ₹2L accident insurance via PMSBY (₹20/year premium), and DBT eligibility.",
      url: "https://pmjdy.gov.in/",
    },
  });

  // ─── 9. PM Fasal Bima Yojana (PMFBY — Crop Insurance) ─────────────────────
  const isPmfbyEligible = profile.is_farmer === true;
  results.push({
    name: "PM Fasal Bima Yojana (Crop Insurance)",
    eligible: isPmfbyEligible ? "yes" : "no",
    confidence: isPmfbyEligible ? 82 : 5,
    reason: isPmfbyEligible
      ? "Farmers pay only 2% premium for Kharif, 1.5% for Rabi, 5% for horticultural crops — rest is subsidized. Covers losses from natural calamities."
      : "Only available for enrolled cultivating farmers.",
    annual_value: "Claim amount varies by crop loss (up to full sum insured)",
    annual_value_number: isPmfbyEligible ? 15000 : 0,
    apply_url: "https://pmfby.gov.in/",
    deadline: "Enroll before cut-off for each season (Kharif: July, Rabi: Dec)",
    source: {
      document: "Pradhan Mantri Fasal Bima Yojana — Ministry of Agriculture",
      rule: "Farmers pay 2% (Kharif), 1.5% (Rabi), 5% (horticulture) of sum insured. Government subsidizes remainder. Mandatory for loanee farmers.",
      url: "https://pmfby.gov.in/",
    },
  });

  // ─── 10. Sukanya Samriddhi Yojana (Girls' Savings Scheme) ─────────────────
  // For girl children below 10 years. 8.2% interest (highest govt-backed rate).
  const isSukanyaEligible = profile.has_children && (profile.gender === "female" || !profile.gender);
  results.push({
    name: "Sukanya Samriddhi Yojana (Girl Child Savings)",
    eligible: isSukanyaEligible ? "yes" : profile.has_children ? "likely" : "no",
    confidence: isSukanyaEligible ? 80 : profile.has_children ? 45 : 5,
    reason: isSukanyaEligible
      ? "You can open a Sukanya Samriddhi account for a girl child below 10 years with 8.2% tax-free interest and full tax exemption on deposits."
      : profile.has_children
      ? "If you have a girl child below 10 years, you are eligible for this high-interest savings scheme."
      : "Only available for families with a girl child below 10 years.",
    annual_value: "8.2% tax-free interest on up to ₹1.5L/year deposits",
    annual_value_number: isSukanyaEligible ? 12300 : 0,
    apply_url: "https://www.indiapost.gov.in/",
    deadline: "Open account before girl turns 10 years",
    source: {
      document: "Sukanya Samriddhi Yojana Rules 2016 — Ministry of Finance",
      rule: "Account for girl child below 10 years. 8.2% interest p.a. (Q1 FY25). Min ₹250/year, Max ₹1.5L/year. Maturity at 21 years or marriage after 18.",
      url: "https://www.nsiindia.gov.in/",
    },
  });

  // ─── 11. Antyodaya Anna Yojana / NFSA (Food Security) ─────────────────────
  // AAY (poorest of the poor): 35 kg/month at ₹2–₹3/kg
  // Priority Household (PHH): 5 kg/person/month at ₹2–₹3/kg
  // PM Garib Kalyan Anna Yojana (PMGKAY): Free grain extended to Dec 2028
  const isFoodSecurityEligible = isBPL || income < 5000 || isSCOrST;
  const isFoodLikely = income < 15000;
  results.push({
    name: "National Food Security Act / PMGKAY (Free Grain)",
    eligible: isFoodSecurityEligible ? "yes" : isFoodLikely ? "likely" : "no",
    confidence: isFoodSecurityEligible ? 85 : isFoodLikely ? 55 : 10,
    reason: isFoodSecurityEligible
      ? "Under PM Garib Kalyan Anna Yojana (extended to Dec 2028), your household is eligible for 5 kg/person/month of free grain (rice/wheat/millets)."
      : isFoodLikely
      ? "Priority Household (PHH) card holders get 5 kg/person/month at ₹2–₹3/kg under NFSA. Check with your Ration Shop for ration card."
      : "NFSA covers ~67% of India's population. Eligibility determined by state government exclusion criteria.",
    annual_value: "~₹1,500–₹4,500/year in food value per person",
    annual_value_number: isFoodSecurityEligible ? 3000 : 0,
    apply_url: "https://nfsa.gov.in/",
    deadline: "Rolling — apply for ration card at local food department office",
    source: {
      document: "National Food Security Act 2013 + PM Garib Kalyan Anna Yojana",
      rule: "PMGKAY provides 5 kg free food grains/person/month to all NFSA beneficiaries. Extended through December 2028.",
      url: "https://nfsa.gov.in/",
    },
  });

  // ─── 12. PM Kaushal Vikas Yojana / PMKVY (Skill Training) ─────────────────
  const isPmkvyEligible = profile.age !== undefined && profile.age >= 15 && profile.age <= 45 && income < 30000;
  results.push({
    name: "PM Kaushal Vikas Yojana (Free Skill Training)",
    eligible: isPmkvyEligible ? "yes" : profile.age !== undefined && profile.age < 45 ? "likely" : "no",
    confidence: isPmkvyEligible ? 75 : 40,
    reason: isPmkvyEligible
      ? "You are eligible for free short-term skill training (150–300 hours) under PMKVY 4.0 in 20+ industry sectors with certification and placement support."
      : "PMKVY 4.0 is open to school/college dropouts and unemployed youth up to age 45.",
    annual_value: "Free training worth ₹5,000–₹15,000 + certification",
    annual_value_number: isPmkvyEligible ? 8000 : 0,
    apply_url: "https://www.pmkvyofficial.org/",
    deadline: "Rolling — batches throughout year at nearby Training Centres",
    source: {
      document: "Pradhan Mantri Kaushal Vikas Yojana 4.0 (2022–2026)",
      rule: "Free short-term skill training, certification and placement assistance. Targets 40 lakh youth under PMKVY 4.0 (2022–2026).",
      url: "https://www.pmkvyofficial.org/",
    },
  });

  return results;
}