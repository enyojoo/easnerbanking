import type { SupabaseClient } from "@supabase/supabase-js"
import "server-only"
import {
  buildTransactionEmailDetailRows,
  buildGridReceiptEmailDetailRows,
  deriveTransactionNotification,
  descriptorToPushContent,
  formatMaskedSenderDisplay,
  formatMoneyDisplay,
  formatTransactionWhen,
  isWalletSendOutRow,
  parseCommunicationPreferences,
  personalMobileTransactionUrl,
  type DeriveTransactionNotificationInput,
  type GlobalPayoutReviewSnapshot,
  type NotificationOutcome,
  isYcFundBalanceDepositMetadata,
  normalizeYcFundBalanceDepositReview,
  reconstructYcFundBalanceDepositReview,
  resolveInboundReceiveDetail,
  resolvePayoutReviewFlow,
} from "@easner/shared"
import type { TransactionEmailData } from "@easner/server"
import { isLedgerTransactionEmailEnabled } from "@/lib/notifications/email-rollout"
import { sendTransactionSettledPush } from "@/lib/notifications/expo-push"
import { resolveEmailAudience } from "@/lib/notifications/resolve-email-audience"
import { fetchUserEmailContact } from "@/lib/notifications/user-contact"
import { resolveWalletSendPayoutReview } from "@/lib/wallet-send/build-wallet-send-payout-review"

export type DispatchTransactionNotificationInput = DeriveTransactionNotificationInput & {
  userId: string
  transactionId: string
  createdAt?: string | null
  userEmail?: string | null
  outcome?: NotificationOutcome
  sendEmail?: boolean
  sendPush?: boolean
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

async function resolveTransactionWhenAt(
  admin: SupabaseClient,
  input: DispatchTransactionNotificationInput,
): Promise<string | undefined> {
  const meta = (input.metadata ?? {}) as Record<string, unknown>
  const embedded = firstString([
    input.createdAt,
    meta.occurred_at,
    meta.ledger_created_at,
    meta.created_at,
    meta.transaction_started_at,
  ])
  if (embedded) return embedded

  const { data } = await admin
    .from("transactions")
    .select("occurred_at,created_at")
    .eq("id", input.transactionId)
    .maybeSingle()
  return firstString([data?.occurred_at, data?.created_at])
}

/** Canonical email detail rows from ledger metadata (payout snapshot or deposit enrichment). */
function buildEmailDetailRows(
  descriptor: ReturnType<typeof deriveTransactionNotification>,
  input: DispatchTransactionNotificationInput,
): { label: string; value: string }[] | undefined {
  const meta = (input.metadata ?? {}) as Record<string, unknown>
  const direction = descriptor.direction

  const payoutReview = isWalletSendOutRow({
    direction: input.direction,
    metadata: meta,
  })
    ? resolveWalletSendPayoutReview(meta, input.amount, input.currency)
    : readValidPayoutReview(meta.payout_review)
  if (payoutReview) {
    const snap = meta.recipient_snapshot as Record<string, unknown> | undefined
    const rows = buildTransactionEmailDetailRows({
      direction,
      payoutReview,
      payoutReviewFlow: resolvePayoutReviewFlow(meta),
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
    const inboundReceive = resolveInboundReceiveDetail({
      provider: input.provider,
      direction: input.direction,
      metadata: meta,
      payload: input.payload ?? null,
      source_type: firstString([meta.source_type]),
      chain: firstString([meta.chain, meta.receive_network]),
      currency: input.currency,
      amount: input.amount,
      deposit_review: normalizeYcFundBalanceDepositReview(meta.deposit_review),
      sender_display_name: firstString([meta.sender_display_name, meta.sender_name]),
      source_payment_rail: firstString([meta.source_payment_rail, meta.payment_rail]),
      reference: firstString([meta.reference, meta.narration]),
      fee_amount: Number(meta.fee_amount ?? meta.fee ?? 0) || null,
      posted_amount: Number(meta.posted_amount ?? meta.settled_amount ?? 0) || null,
      posted_currency: firstString([meta.posted_currency, meta.settled_currency, meta.currency]),
      settled_amount: Number(meta.settled_amount ?? 0) || null,
      settled_currency: firstString([meta.settled_currency, meta.currency]),
      created_at: firstString([meta.created_at]),
      ledger_created_at: firstString([meta.ledger_created_at, meta.created_at]),
      easner_transaction_id: input.easnerTransactionId ?? input.transactionId,
      send_note: firstString([meta.send_note, meta.note]),
    })
    if (inboundReceive) {
      const rows = buildTransactionEmailDetailRows({ direction, inboundReceive })
      return rows.length ? rows : undefined
    }

    if (isYcFundBalanceDepositMetadata(meta)) {
      const depositReview =
        normalizeYcFundBalanceDepositReview(meta.deposit_review) ??
        reconstructYcFundBalanceDepositReview(
          meta,
          typeof meta.customer_rate === "number" ? meta.customer_rate : Number(meta.customer_rate),
        )
      if (depositReview) {
        const rows = buildTransactionEmailDetailRows({
          direction,
          depositReview,
        })
        return rows.length ? rows : undefined
      }
    }

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

function isGridMoneyTransmissionProvider(provider: string | null | undefined): boolean {
  return String(provider ?? "").trim().toLowerCase() === "grid"
}

function moneyDisplayFromMeta(
  amount: unknown,
  currency: unknown,
  fallbackDisplay?: string | null,
): string | undefined {
  const n = typeof amount === "number" ? amount : Number(amount)
  const cur = typeof currency === "string" ? currency.trim().toUpperCase() : ""
  if (Number.isFinite(n) && cur) return formatMoneyDisplay(n, cur)
  return fallbackDisplay?.trim() || undefined
}

/** Grid regulatory receipt rows — fiat only; no crypto/chain fields. */
function buildGridEmailDetailRows(
  descriptor: ReturnType<typeof deriveTransactionNotification>,
  input: DispatchTransactionNotificationInput,
): { label: string; value: string }[] | undefined {
  const meta = (input.metadata ?? {}) as Record<string, unknown>
  const gridTransactionId = firstString([
    meta.grid_transaction_id,
    meta.provider_transaction_id,
    input.transactionId,
  ])
  if (!gridTransactionId) return undefined

  const snap = meta.recipient_snapshot as Record<string, unknown> | undefined
  const payoutReview = readValidPayoutReview(meta.payout_review)
  const senderName =
    firstString([
      meta.sender_name,
      meta.sender_display_name,
      meta.business_name,
      meta.platform_customer_name,
    ]) || undefined
  const recipientName =
    firstString([
      snap?.full_name,
      meta.recipient_name,
      meta.beneficiary_name,
      meta.counterparty_name,
      descriptor.counterpartyName,
    ]) || undefined

  const transferAmount =
    moneyDisplayFromMeta(
      payoutReview?.you_send_amount ?? meta.send_amount ?? meta.transfer_amount ?? input.amount,
      payoutReview?.send_currency ?? meta.send_currency ?? input.currency,
      descriptor.amountDisplay,
    ) || descriptor.amountDisplay

  const totalToRecipient = moneyDisplayFromMeta(
    payoutReview?.receive_amount ?? meta.receive_amount ?? meta.total_to_recipient,
    payoutReview?.receive_currency ?? meta.receive_currency ?? meta.destination_currency,
  )

  const fees = moneyDisplayFromMeta(
    payoutReview?.processing_fee ??
      meta.fee_amount ??
      meta.total_transfer_fees ??
      meta.fees,
    payoutReview?.send_currency ?? meta.fee_currency ?? input.currency,
  )

  const total = moneyDisplayFromMeta(
    payoutReview?.total_debited ?? meta.total_debited ?? meta.total,
    payoutReview?.send_currency ?? meta.send_currency ?? input.currency,
    transferAmount,
  )

  const rate = Number(payoutReview?.exchange_rate ?? meta.exchange_rate ?? meta.customer_rate)
  const sendCur = firstString([
    payoutReview?.send_currency,
    meta.send_currency,
    input.currency,
  ])
  const recvCur = firstString([
    payoutReview?.receive_currency,
    meta.receive_currency,
    meta.destination_currency,
  ])
  const exchangeRateDisplay =
    Number.isFinite(rate) && rate > 0 && sendCur && recvCur && sendCur !== recvCur
      ? `1 ${sendCur} = ${rate.toFixed(4)} ${recvCur}`
      : undefined

  const mode = firstString([meta.grid_mode, meta.yc_mode, meta.mode])
  const transactionType =
    mode === "cross_border_send"
      ? "Cross-border send"
      : mode === "fund_balance"
        ? "Fund balance"
        : mode === "balance_payout"
          ? "Balance payout"
          : descriptor.direction === "in"
            ? "Incoming payment"
            : "Outgoing payment"

  const settledAtDisplay = formatTransactionWhen(
    firstString([
      meta.settled_at,
      input.createdAt,
      meta.occurred_at,
      meta.ledger_created_at,
    ]) ?? "",
  )

  const rows = buildGridReceiptEmailDetailRows({
    gridTransactionId,
    easnerTransactionId: input.easnerTransactionId ?? input.transactionId,
    senderName,
    recipientName,
    transferAmountDisplay: transferAmount,
    totalToRecipientDisplay: totalToRecipient,
    totalTransferFeesDisplay: fees,
    totalDisplay: total,
    exchangeRateDisplay,
    transactionType,
    settledAtDisplay: settledAtDisplay || undefined,
  })
  return rows.length ? rows : undefined
}

function descriptorToEmailData(
  descriptor: ReturnType<typeof deriveTransactionNotification>,
  input: DispatchTransactionNotificationInput,
  audience: Awaited<ReturnType<typeof resolveEmailAudience>>,
  firstName?: string,
): TransactionEmailData {
  const businessBase =
    process.env.NEXT_PUBLIC_BUSINESS_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://business.easner.com"
  const id = input.easnerTransactionId || input.transactionId
  const isGrid =
    isGridMoneyTransmissionProvider(input.provider) && (input.outcome ?? "success") === "success"
  const meta = (input.metadata ?? {}) as Record<string, unknown>
  const gridTransactionId = isGrid
    ? firstString([meta.grid_transaction_id, meta.provider_transaction_id])
    : undefined
  const mode = firstString([meta.grid_mode, meta.yc_mode, meta.mode])
  const recvCurForDisclosure = firstString([
    meta.receive_currency,
    meta.fiat_currency,
    meta.destination_currency,
  ])
  const sendCurForDisclosure = firstString([meta.send_currency, input.currency, "USD"])
  const includeForeignRemittance =
    isGrid &&
    (mode === "cross_border_send" ||
      mode === "balance_payout" ||
      Boolean(recvCurForDisclosure && sendCurForDisclosure && recvCurForDisclosure !== sendCurForDisclosure))

  return {
    transactionId: input.transactionId,
    easnerTransactionId: input.easnerTransactionId,
    title: descriptor.title,
    emailSubject: isGrid
      ? `Your Easner transfer receipt - ${descriptor.amountDisplay}`
      : descriptor.emailSubject,
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
    detailRows: isGrid
      ? buildGridEmailDetailRows(descriptor, input) ?? buildEmailDetailRows(descriptor, input)
      : buildEmailDetailRows(descriptor, input),
    createdAt:
      input.createdAt ??
      firstString([
        meta.occurred_at,
        meta.ledger_created_at,
        meta.created_at,
        meta.transaction_started_at,
      ]),
    firstName,
    audience,
    isGridMoneyTransmissionReceipt: isGrid,
    gridTransactionId,
    includeForeignRemittanceDisclosure: includeForeignRemittance,
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
      data: {
        type: "transaction_settled",
        transactionId: input.transactionId,
        easnerTransactionId: input.easnerTransactionId ?? undefined,
        amount: input.amount,
        currency: input.currency,
        direction: input.direction ?? undefined,
        status: "settled",
        category: descriptor.category,
        displayTitle: descriptor.pushTitle,
      },
    }).catch((e) => console.warn("transaction notification push (non-fatal):", e))
  }

  if (sendEmailChannel && parsed.channels.email) {
    const contact = await fetchUserEmailContact(admin, input.userId)
    const email = input.userEmail?.trim() || contact.email
    if (email) {
      const createdAt = await resolveTransactionWhenAt(admin, input)
      const emailData = descriptorToEmailData(
        descriptor,
        { ...input, createdAt },
        audience,
        contact.firstName,
      )
      const { emailService } = await import("@easner/server")
      const sendResult = await emailService
        .sendTransactionSettledEmail(email, emailData, prefs)
        .catch((e) => {
          console.warn("transaction notification email (non-fatal):", e)
          return null
        })

      if (
        sendResult?.success &&
        emailData.isGridMoneyTransmissionReceipt &&
        emailData.gridTransactionId &&
        (input.outcome ?? "success") === "success"
      ) {
        try {
          const { confirmGridReceiptDelivery } = await import(
            "@/lib/grid/confirm-receipt-delivery"
          )
          await confirmGridReceiptDelivery({
            admin,
            ledgerTransactionId: input.transactionId,
            gridTransactionId: emailData.gridTransactionId,
            metadata: (input.metadata ?? {}) as Record<string, unknown>,
          })
        } catch (e) {
          console.warn("grid receipt confirm (non-fatal):", e)
        }
      }
    } else {
      console.warn(
        `[email] skipped ledger transaction email user=${input.userId} tx=${input.transactionId}: no users.email`,
      )
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
