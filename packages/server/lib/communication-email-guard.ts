import type { CommunicationPreferences } from "@easner/shared"
import { parseCommunicationPreferences } from "@easner/shared"

/**
 * Maps `emailTemplates` keys in email-templates.ts to a preference bucket.
 * `transactional` and `internal` are never suppressed by user toggles.
 */
export type EmailPreferenceCategory =
  | "transactional"
  | "product_updates"
  | "security_alerts"
  | "marketing"
  | "internal"

const TEMPLATE_PREFERENCE: Record<string, EmailPreferenceCategory> = {
  welcome: "product_updates",
  transactionPending: "transactional",
  transactionProcessing: "transactional",
  transactionCompleted: "transactional",
  transactionFailed: "transactional",
  transactionCancelled: "transactional",
  earlyAccessRequest: "marketing",
  earlyAccessConfirmation: "marketing",
  adminTransactionNotification: "internal",
}

/**
 * Transaction lifecycle and invoice-to-customer emails must always be deliverable
 * (product policy; aligns with plan "do not block transaction status").
 */
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
