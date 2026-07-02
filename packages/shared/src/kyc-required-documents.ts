/**
 * Individual KYC expectations for hosted onboarding (informational copy only).
 * Derived from Noah Individual Customer Prefill docs — not submitted via prefill today.
 * @see https://docs.noah.com/recipes/onboarding/individual-customer-prefill/
 */

export const KYC_REQUIRED_DOCUMENTS_DIALOG = {
  title: "What you'll need for verification",
  intro: "To verify your identity, please have the following ready.",
  sections: [
    {
      heading: "Identity",
      body: "A valid physical government-issued photo ID (paper-format IDs are not accepted), current and fully visible — all pages or sides, with no glare or blur.",
    },
    {
      heading: "Selfie",
      body: "A live selfie for the liveness check.",
    },
    {
      heading: "Personal details",
      body: "Full legal name, date of birth, nationality, residential address, and email — they must match your ID exactly.",
    },
    {
      heading: "Tax identifiers",
      body: "Where applicable for your country (for example BVN for Nigeria; SSN may be requested for US users).",
    },
    {
      heading: "Additional questions",
      body: "You may be asked about source of funds, employment, and how you plan to use your account — especially if you're in a higher-risk region. These are collected in the hosted verification flow.",
    },
  ] as const,
  closing:
    "Having these ready helps your verification go through smoothly the first time.",
  inlinePrompt: "Before you begin, ",
  inlineLink: "see what you'll need",
  inlineSuffix: " for verification.",
} as const

/** Reference: questionnaire fields Noah may collect in hosted flow (not Easner form fields). */
export const KYC_HOSTED_QUESTIONNAIRE_FIELDS = [
  "SourceOfIncome",
  "EmploymentStatus",
  "WorkIndustry",
  "FinancialsUsd.AnnualDeposit",
  "TransactionFrequency",
] as const
