import type { CommunicationPreferences } from "../../shared/src/communication-preferences"
import { parseCommunicationPreferences } from "../../shared/src/communication-preferences"

/**
 * Maps `emailTemplates` keys to a preference bucket.
 * `transactional` and `internal` are never suppressed by product/marketing toggles.
 */
export type EmailPreferenceCategory =
  | "transactional"
  | "product_updates"
  | "security_alerts"
  | "marketing"
  | "internal"

const TEMPLATE_PREFERENCE: Record<string, EmailPreferenceCategory> = {
  welcomeBusiness: "product_updates",
  welcomePersonal: "product_updates",
  transactionSettled: "transactional",
  transactionFailed: "transactional",
  transactionReversed: "transactional",
  kybSubmitted: "transactional",
  kybApproved: "transactional",
  kybRejected: "transactional",
  kybActionNeeded: "transactional",
  kybOpsNotification: "internal",
  kycOpsNotification: "internal",
  kycSubmitted: "transactional",
  kycApproved: "transactional",
  kycRejected: "transactional",
  onlinePaymentsSetupStarted: "transactional",
  onlinePaymentsActionRequired: "transactional",
  onlinePaymentsReady: "transactional",
  teamInvitation: "transactional",
  teamMemberJoined: "transactional",
  payrollEasetagInvite: "transactional",
  payrollPaid: "transactional",
  payrollConnectionApproved: "transactional",
  payrollConnectionDeclined: "transactional",
  payrollConnectionRevoked: "transactional",
  payrollRunSummary: "transactional",
  payrollFundingNeeded: "transactional",
  passwordChanged: "security_alerts",
  passwordResetCompleted: "security_alerts",
  mfaEnabled: "security_alerts",
  mfaDisabled: "security_alerts",
  newDeviceLogin: "security_alerts",
  adminTransactionNotification: "internal",
  appDownloadLink: "marketing",
  accountStatement: "transactional",
  accountRestricted: "transactional",
  accountRestrictionClosed: "transactional",
  accountRestrictionLifted: "transactional",
  accountRestrictionOpsNotification: "internal",
}

export function emailTemplatePreferenceCategory(templateKey: string): EmailPreferenceCategory {
  return TEMPLATE_PREFERENCE[templateKey] ?? "product_updates"
}

export function shouldSendTemplatedEmail(
  templateKey: string,
  prefsRaw: unknown,
): { send: boolean; reason?: string } {
  const category = emailTemplatePreferenceCategory(templateKey)

  if (category === "transactional" || category === "internal") {
    return { send: true }
  }

  const prefs: CommunicationPreferences = parseCommunicationPreferences(prefsRaw)

  if (!prefs.channels.email) {
    return { send: false, reason: "User disabled email channel" }
  }

  switch (category) {
    case "product_updates":
      return prefs.productUpdates
        ? { send: true }
        : { send: false, reason: "User opted out of product updates" }
    case "security_alerts":
      return prefs.securityAlerts
        ? { send: true }
        : { send: false, reason: "User opted out of security alerts" }
    case "marketing":
      return prefs.marketingEmails
        ? { send: true }
        : { send: false, reason: "User opted out of marketing emails" }
    default:
      return { send: true }
  }
}
