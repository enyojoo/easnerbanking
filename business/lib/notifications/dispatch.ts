import type { SupabaseClient } from "@supabase/supabase-js"
import "server-only"
import {
  buildTransactionEmailDetailRows,
  deriveTransactionNotification,
  descriptorToPushContent,
  formatMaskedSenderDisplay,
  parseCommunicationPreferences,
  personalMobileTransactionUrl,
  type DeriveTransactionNotificationInput,
  type GlobalPayoutReviewSnapshot,
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

function readValidPayoutReview(raw: unknown): GlobalPayoutReviewSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const receiveAmount = Number(o.receive_amount)
  const totalDebited = Number(o.total_debited)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return null
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) return null
  return raw as GlobalPayoutReviewSnapshot
}

function firstString(values: readonly unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim()
    if (typeof v === "number" && Number.isFinite(v)) return String(v)
  }
  return undefined
}

/** Canonical email detail rows from ledger metadata (payout snapshot or deposit enrichment). */
function buildEmailDetailRows(
  descriptor: ReturnType<typeof deriveTransactionNotification>,
  input: DispatchTransactionNotificationInput,
): { label: string; value: string }[] | undefined {
  const meta = (input.metadata ?? {}) as Record<string, unknown>
  const direction = descriptor.direction

  const payoutReview = readValidPayoutReview(meta.payout_review)
  if (payoutReview) {
    const snap = meta.recipient_snapshot as Record<string, unknown> | undefined
    const rows = buildTransactionEmailDetailRows({
      direction,
      payoutReview,
      receiveNetwork: firstString([meta.receive_network, meta.chain, meta.receive_asset_network]),
      recipient: snap
        ? {
            fullName: firstString([snap.full_name]) ?? descriptor.counterpartyName ?? null,
            bankName: firstString([snap.bank_name]) ?? null,
            accountNumber: firstString([snap.account_number]) ?? null,
            phone: firstString([snap.phone]) ?? null,
            mobileProvider: firstString([snap.mobile_provider]) ?? null,
            walletNetwork:
              firstString([meta.receive_network, meta.chain, snap.wallet_network]) ?? null,
          }
        : descriptor.counterpartyName
          ? { fullName: descriptor.counterpartyName }
          : null,
    })
    return rows.length ? rows : undefined
  }

  if (direction === "in") {
    const senderDisplay =
      descriptor.counterpartyName ||
      formatMaskedSenderDisplay({
        senderName: firstString([meta.sender_name, meta.sender_display_name]),
        counterpartyAddress: firstString([meta.counterparty_address, meta.from_address]),
      }) ||
      null
    const rows = buildTransactionEmailDetailRows({
      direction,
      deposit: {
        scheme: firstString([
          meta.payment_scheme,
          meta.deposit_scheme_label,
          meta.source_payment_rail,
        ]),
        senderDisplay,
        feeAmount: Number(meta.fee_amount ?? meta.fee ?? 0) || null,
        feeCurrency: firstString([meta.currency, meta.settled_currency]),
        postedAmount: Number(meta.posted_amount ?? meta.settled_amount ?? 0) || null,
        postedCurrency: firstString([meta.posted_currency, meta.settled_currency, meta.currency]),
        narration: firstString([meta.narration, meta.reference]),
      },
    })
    return rows.length ? rows : undefined
  }

  return undefined
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
    detailRows: buildEmailDetailRows(descriptor, input),
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
