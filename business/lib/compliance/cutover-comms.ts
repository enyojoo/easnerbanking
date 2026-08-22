/** Settings deep link for hosted business KYB (Verification tab). */
export const SETTINGS_VERIFICATION_HREF = "/settings?tab=verification"

/** Full-page hosted KYB flow on Settings (hides tab chrome; Back returns to tab hub). */
export const SETTINGS_VERIFICATION_FLOW_HREF = "/settings?tab=verification&flow=hosted"

export const SETTINGS_VERIFICATION_FLOW_PARAM = "hosted" as const

/** Full-page Stripe Connect / online-payments KYB on Settings. */
export const SETTINGS_CONNECT_FLOW_HREF = "/settings?tab=verification&flow=connect"

export const SETTINGS_CONNECT_FLOW_PARAM = "connect" as const

export const SETTINGS_EXPRESS_FLOW_HREF = "/settings?tab=verification&flow=express"
export const SETTINGS_EXPRESS_FLOW_PARAM = "express" as const

export type SettingsVerificationEmbeddedFlow =
  | typeof SETTINGS_VERIFICATION_FLOW_PARAM
  | typeof SETTINGS_CONNECT_FLOW_PARAM
  | typeof SETTINGS_EXPRESS_FLOW_PARAM

export function parseSettingsVerificationFlow(
  flow: string | null | undefined,
): SettingsVerificationEmbeddedFlow | null {
  if (
    flow === SETTINGS_VERIFICATION_FLOW_PARAM ||
    flow === SETTINGS_CONNECT_FLOW_PARAM ||
    flow === SETTINGS_EXPRESS_FLOW_PARAM
  ) {
    return flow
  }
  return null
}

export function isSettingsVerificationFlowLocation(
  pathname: string,
  search: string,
): boolean {
  if (!pathname.startsWith("/settings")) return false
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  return (
    params.get("tab") === "verification" &&
    parseSettingsVerificationFlow(params.get("flow")) != null
  )
}

export function isHostedVerificationFlowLocation(
  pathname: string,
  search: string,
): boolean {
  return isSettingsVerificationFlowLocation(pathname, search)
}

/** Email template for business KYB cutover – re-verification required. */
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
    "– Easner",
  ].join("\n")

  const html = `
    <p>Hi ${input.businessName},</p>
    <p>We upgraded business verification on Easner. To continue sending, receiving, and invoicing, please complete verification again.</p>
    <p><a href="${input.verifyUrl}">Start verification</a></p>
    <p>If you have open bank deposit instructions from before this change, please finish any in-flight deposits within the wind-down window shown in your dashboard.</p>
    <p>– Easner</p>
  `.trim()

  return { subject, text, html }
}

/** Ops checklist for Noah VA wind-down during Grid KYB cutover. */
export const KYB_CUTOVER_OPS_CHECKLIST = [
  "Inventory approved businesses and open Noah receivables",
  "Communicate receive wind-down window for retired Noah VAs",
  "Send re-verification email to affected businesses",
  "Monitor Grid CUSTOMER.KYB_* webhooks and sync-status poll backup",
] as const
