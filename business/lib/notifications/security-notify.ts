import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService } from "@easner/server"
import type { SecurityAlertEmailData } from "@easner/server"
import { resolveEmailAudience } from "@/lib/notifications/resolve-email-audience"
import { fetchUserEmailContact } from "@/lib/notifications/user-contact"

const TEMPLATE_BY_ALERT: Record<SecurityAlertEmailData["alertType"], string> = {
  password_changed: "passwordChanged",
  password_reset_completed: "passwordResetCompleted",
  mfa_enabled: "mfaEnabled",
  mfa_disabled: "mfaDisabled",
  new_device: "newDeviceLogin",
}

async function fetchCommunicationPreferences(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("user_preferences")
    .select("communication_preferences")
    .eq("user_id", userId)
    .maybeSingle()
  return (data as { communication_preferences?: unknown } | null)?.communication_preferences
}

export async function sendSecurityAlertEmail(
  admin: SupabaseClient,
  input: {
    userId: string
    userEmail: string
    alertType: SecurityAlertEmailData["alertType"]
    deviceLabel?: string
  },
): Promise<void> {
  const audience = await resolveEmailAudience(admin, input.userId)
  const prefs = await fetchCommunicationPreferences(admin, input.userId)
  const contact = await fetchUserEmailContact(admin, input.userId)
  const data: SecurityAlertEmailData = {
    email: input.userEmail,
    alertType: input.alertType,
    deviceLabel: input.deviceLabel,
    occurredAt: new Date().toISOString(),
    firstName: contact.firstName,
    audience,
  }
  await emailService
    .sendEmail(
      {
        to: input.userEmail,
        template: TEMPLATE_BY_ALERT[input.alertType],
        data,
        audience,
      },
      prefs,
    )
    .catch((e) => console.warn("security alert email (non-fatal):", e))
}
