import type { SupabaseClient } from "@supabase/supabase-js"
import "server-only"
import {
  deriveTransactionNotification,
  descriptorToPushContent,
  parseCommunicationPreferences,
  personalMobileTransactionUrl,
  type DeriveTransactionNotificationInput,
  type NotificationOutcome,
} from "@easner/shared"
import type { TransactionEmailData } from "@easner/server"
import { isLedgerTransactionEmailEnabled } from "@/lib/notifications/email-rollout"
import { sendTransactionSettledPush } from "@/lib/notifications/expo-push"
import { resolveEmailAudience } from "@/lib/notifications/resolve-email-audience"

export type DispatchTransactionNotificationInput = DeriveTransactionNotificationInput & {
  userId: string
  transactionId: string
  userEmail?: string | null
  outcome?: NotificationOutcome
  sendEmail?: boolean
  sendPush?: boolean
}

async function fetchUserEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("users").select("email").eq("id", userId).maybeSingle()
  return data?.email?.trim() || null
}

async function fetchCommunicationPreferences(
  admin: SupabaseClient,
  userId: string,
): Promise<unknown> {
  const { data } = await admin
    .from("user_preferences")
    .select("communication_preferences")
    .eq("user_id", userId)
    .maybeSingle()
  return (data as { communication_preferences?: unknown } | null)?.communication_preferences
}

function descriptorToEmailData(
  descriptor: ReturnType<typeof deriveTransactionNotification>,
  input: DispatchTransactionNotificationInput,
  audience: Awaited<ReturnType<typeof resolveEmailAudience>>,
): TransactionEmailData {
  const businessBase =
    process.env.NEXT_PUBLIC_BUSINESS_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://business.easner.com"
  const id = input.easnerTransactionId || input.transactionId
  return {
    transactionId: input.transactionId,
    easnerTransactionId: input.easnerTransactionId,
    title: descriptor.title,
    emailSubject: descriptor.emailSubject,
    body: descriptor.body,
    amountDisplay: descriptor.amountDisplay,
    counterpartyLabel: descriptor.counterpartyLabel,
    counterpartyName: descriptor.counterpartyName,
    direction: descriptor.direction ?? undefined,
    provider: descriptor.provider,
    paymentRail: descriptor.paymentRail,
    category: descriptor.category,
    status:
      input.outcome === "success"
        ? "settled"
        : input.outcome === "reversed"
          ? "reversed"
          : "failed",
    outcome: descriptor.outcome,
    failureReason: descriptor.failureReason,
    detailUrl:
      audience === "business"
        ? `${businessBase}/transactions/${encodeURIComponent(id)}`
        : personalMobileTransactionUrl(id, process.env.NEXT_PUBLIC_MOBILE_APP_URL),
    audience,
  }
}

/**
 * FUTURE: in-app notifications feed (out of scope).
 * Wire a writer here when the notifications table + mobile feed ship.
 */
export async function writeInAppNotificationRow(
  _admin: SupabaseClient,
  _input: {
    userId: string
    transactionId: string
    descriptor: ReturnType<typeof deriveTransactionNotification>
    outcome: NotificationOutcome
  },
): Promise<void> {
  // no-op — extension point for future in-app feed
}

/** Unified push + email dispatch for ledger transaction events. */
export async function dispatchTransactionNotification(
  admin: SupabaseClient,
  input: DispatchTransactionNotificationInput,
): Promise<void> {
  const outcome = input.outcome ?? "success"
  // Failed transfers restore debited funds — no separate reversal notifications.
  if (outcome === "reversed") return
  const descriptor = deriveTransactionNotification({ ...input, outcome })
  const { title, body } = descriptorToPushContent(descriptor)

  const sendPush = input.sendPush !== false
  const sendEmailChannel =
    input.sendEmail !== false && descriptor.emailEnabled && isLedgerTransactionEmailEnabled()

  const prefs = await fetchCommunicationPreferences(admin, input.userId)
  const parsed = parseCommunicationPreferences(prefs)
  const audience = await resolveEmailAudience(admin, input.userId)

  // Business is email-only — no Expo push.
  if (audience !== "business" && sendPush && parsed.channels.push) {
    await sendTransactionSettledPush(admin, {
      userId: input.userId,
      transactionId: input.transactionId,
      title,
      body,
      data: { type: "transaction_settled", transactionId: input.transactionId },
    }).catch((e) => console.warn("transaction notification push (non-fatal):", e))
  }

  if (sendEmailChannel && parsed.channels.email) {
    const email = input.userEmail?.trim() || (await fetchUserEmail(admin, input.userId))
    if (email) {
      const emailData = descriptorToEmailData(descriptor, input, audience)
      const { emailService } = await import("@easner/server")
      await emailService
        .sendTransactionSettledEmail(email, emailData, prefs)
        .catch((e) => console.warn("transaction notification email (non-fatal):", e))
    }
  } else if (
    input.sendEmail !== false &&
    descriptor.emailEnabled &&
    !isLedgerTransactionEmailEnabled()
  ) {
    console.info(
      `[email] skipped ledger transaction email user=${input.userId} tx=${input.transactionId}: LEDGER_TRANSACTION_EMAIL_ENABLED=false`,
    )
  }

  // FUTURE: in-app notifications feed (out of scope)
  // await writeInAppNotificationRow(admin, { userId: input.userId, transactionId: input.transactionId, descriptor, outcome })
}
