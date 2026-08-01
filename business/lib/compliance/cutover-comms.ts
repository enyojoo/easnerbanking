/** Email template for business KYB cutover — re-verification required. */
export function buildBusinessKybCutoverEmail(input: {
  businessName: string
  verifyUrl: string
}): { subject: string; text: string; html: string } {
  const subject = "Action required: verify your business on Easner"
  const text = [
    `Hi ${input.businessName},`,
    "",
    "We upgraded business verification on Easner. To continue sending, receiving, and invoicing, please complete verification again.",
    "",
    `Start verification: ${input.verifyUrl}`,
    "",
    "If you have open bank deposit instructions from before this change, please finish any in-flight deposits within the wind-down window shown in your dashboard.",
    "",
    "— Easner",
  ].join("\n")

  const html = `
    <p>Hi ${input.businessName},</p>
    <p>We upgraded business verification on Easner. To continue sending, receiving, and invoicing, please complete verification again.</p>
    <p><a href="${input.verifyUrl}">Start verification</a></p>
    <p>If you have open bank deposit instructions from before this change, please finish any in-flight deposits within the wind-down window shown in your dashboard.</p>
    <p>— Easner</p>
  `.trim()

  return { subject, text, html }
}

/** Ops checklist for Noah VA wind-down during Grid KYB cutover. */
export const KYB_CUTOVER_OPS_CHECKLIST = [
  "Inventory approved businesses and open Noah receivables",
  "Communicate receive wind-down window for retired Noah VAs",
  "Enable in-app cutover banner and send re-verification email",
  "Monitor Grid CUSTOMER.KYB_* webhooks and sync-status poll backup",
] as const
