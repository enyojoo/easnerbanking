/**
 * Business KYB document checklist (informational copy for hosted verification).
 */

export const KYB_REQUIRED_DOCUMENTS_DIALOG = {
  title: "Required documents for verification",
  intro:
    "To verify your business, please have the following ready. All documents must be original, current, and issued by the relevant registry or authority. Names on documents must match your registry records exactly.",
  companyDocuments: [
    "Memorandum and Articles of Association",
    "Registry Extract (active)",
    "Shareholders Extract",
    "Directors Extract",
    "Corporate Shareholder Extract (if applicable)",
    "Proof of Source of Funds",
  ] as const,
  ownersHeading: "Owners & representatives",
  ownersBody:
    "Anyone who owns 25% or more of the business, along with authorized representatives, will complete identity verification with a valid government-issued photo ID and a live selfie. Paper-format IDs are not accepted.",
  closing: "Having these ready helps your verification go through smoothly the first time.",
  inlinePrompt: "Before you begin, ",
  inlineLink: "click here",
  inlineSuffix: " for required documents.",
} as const
