import type { SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"
import { pickNoahWorkflowIdFromResponse } from "@/lib/noah/bank-onramp-workflow"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"
import {
  applyGlobalPayoutWalletDebitForEasnerPayoutId,
  pendingGlobalPayoutProviderTransactionId,
  reverseGlobalPayoutWalletDebitForEasnerPayoutId,
  settlementWalletCurrencyForNoahCrypto,
} from "@/lib/noah/global-payout-ledger"
import {
  assertMarginCaptureModeReady,
  getGlobalPayoutMarginCaptureMode,
} from "@/lib/noah/margin-capture-mode"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolvePooledSolanaSourceAddress } from "@/lib/liquidity/platform-pool"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { generateTransactionId } from "@/lib/transaction-id"
import {
  prepareSellFromRecipientRow,
  type RecipientSellPrepareRow,
  type SellPrepareOverrides,
} from "@/lib/terminal/recipient-sell-prepare"
import {
  buildRecipientSnapshotFromRow,
  normalizePayoutReviewSnapshot,
  type GlobalPayoutReviewSnapshot,
} from "@/lib/noah/build-payout-execute-snapshot"
import {
  pickDestinationAddress,
  pickTriggerCryptoAmount,
  startOnchainDepositToPaymentWorkflow,
} from "@/lib/terminal/automated-payout-workflow"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import type { GlobalPayoutMarginCaptureMode } from "@easner/shared"

const NOAH_OFFRAMP_NETWORK = "Solana"

export type QuotedPayoutSession = {
  formSessionId: string
  cryptoAuthorizedAmount: string
  channelId?: string
  noahFloor?: string
  noahSendAmount?: string
  totalDebited?: string
  marginAmount?: string
  marginCaptureMode?: GlobalPayoutMarginCaptureMode
  customerRate?: number
  noahMid?: number
}

export type ExecuteTurnkeyOfframpPayoutInput = {
  admin: SupabaseClient
  ctx: NoahAccountContext
  userId: string
  businessId: string | null
  recipientRow: RecipientSellPrepareRow
  recipientId?: string
  fiatAmount: number
  fiatCurrency: string
  cryptoCurrency: string
  countryCode: string
  channelId?: string
  overrides?: SellPrepareOverrides
  idempotencyKey?: string
  reviewSnapshot?: GlobalPayoutReviewSnapshot
  sendNote?: string
  quotedSession?: QuotedPayoutSession
}

export type ExecuteTurnkeyOfframpPayoutResult =
  | {
      ok: true
      easnerPayoutId: string
      easnerTransactionId: string
      status: "pending" | "failed"
      turnkeySendId?: string
      turnkeySendStatus?: "pending" | "settled" | "failed"
    }
  | { ok: false; error: string }

function pendingProviderTransactionId(easnerPayoutId: string): string {
  return pendingGlobalPayoutProviderTransactionId(easnerPayoutId)
}

function assetForCrypto(cryptoCurrency: string): "USDC" | "EURC" {
  const c = cryptoCurrency.trim().toUpperCase()
  if (c.includes("EUR")) return "EURC"
  return "USDC"
}

function parsePositiveAmount(raw: string | undefined): number | null {
  const n = Number.parseFloat(String(raw ?? ""))
  return Number.isFinite(n) && n > 0 ? n : null
}

async function readAvailableBalance(
  admin: SupabaseClient,
  opts: { businessId: string | null; userId: string | null; currency: "USD" | "EUR" },
): Promise<{ available: number; err?: string }> {
  let q = admin.from("wallet_balances").select("available_balance").eq("currency", opts.currency).limit(1)
  if (opts.businessId) q = q.eq("business_id", opts.businessId)
  else if (opts.userId) q = q.eq("user_id", opts.userId)
  else return { available: 0, err: "invalid_scope" }
  const { data, error } = await q.maybeSingle()
  if (error) return { available: 0, err: error.message }
  return { available: Number(data?.available_balance ?? 0) }
}

async function markGlobalPayoutExecuteFailed(
  admin: SupabaseClient,
  input: {
    easnerPayoutId: string
    pendingMetadata: Record<string, unknown>
    detail: string
    extraMetadata?: Record<string, unknown>
  },
): Promise<void> {
  await admin
    .from("transactions")
    .update({
      status: "failed",
      metadata: {
        ...input.pendingMetadata,
        failure_reason: input.detail,
        ...input.extraMetadata,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "noah")
    .eq("provider_transaction_id", pendingGlobalPayoutProviderTransactionId(input.easnerPayoutId))

  await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
    easnerPayoutId: input.easnerPayoutId,
  }).catch((e) => console.warn("global_payout_execute_failed_reversal:", e))

  const { notifyGlobalPayoutFailed } = await import("@/lib/notifications/global-payout-notify")
  await notifyGlobalPayoutFailed(admin, input.easnerPayoutId, input.detail)
}

async function findExistingPayoutByIdempotency(
  admin: SupabaseClient,
  opts: { userId: string; businessId: string | null; idempotencyKey: string },
): Promise<ExecuteTurnkeyOfframpPayoutResult | null> {
  let q = admin
    .from("transactions")
    .select("provider_transaction_id, status, metadata, easner_transaction_id")
    .eq("provider", "noah")
    .contains("metadata", { idempotency_key: opts.idempotencyKey })
    .in("status", ["pending", "processing", "settled"])
    .limit(1)
  if (opts.businessId) q = q.eq("business_id", opts.businessId)
  else q = q.eq("user_id", opts.userId)
  const { data } = await q.maybeSingle()
  if (!data) return null
  const meta = (data.metadata || {}) as Record<string, unknown>
  const easnerPayoutId = String(meta.easner_payout_id || "").trim()
  const easnerTransactionId = String(
    data.easner_transaction_id || meta.easner_transaction_id || easnerPayoutId || "",
  ).trim()
  if (!easnerPayoutId) return null
  return {
    ok: true,
    easnerPayoutId,
    easnerTransactionId: easnerTransactionId || generateTransactionId(),
    status: String(data.status || "pending").toLowerCase() === "failed" ? "failed" : "pending",
    turnkeySendId:
      typeof meta.turnkey_send_id === "string" ? meta.turnkey_send_id : undefined,
  }
}

/**
 * Standard Model global fiat off-ramp: fresh prepare → onchain-deposit workflow → Turnkey SPL send.
 */
export async function executeTurnkeyOfframpPayout(
  input: ExecuteTurnkeyOfframpPayoutInput,
): Promise<ExecuteTurnkeyOfframpPayoutResult> {
  const {
    admin,
    ctx,
    userId,
    businessId,
    recipientRow,
    recipientId,
    fiatAmount,
    fiatCurrency,
    cryptoCurrency,
    countryCode,
    channelId,
    overrides,
    reviewSnapshot: reviewSnapshotRaw,
    sendNote,
  } = input

  const idempotencyKey = String(input.idempotencyKey || "").trim()
  if (idempotencyKey) {
    const existing = await findExistingPayoutByIdempotency(admin, {
      userId,
      businessId,
      idempotencyKey,
    })
    if (existing) return existing
  }

  const easnerPayoutId = randomUUID()
  const easnerTransactionId = generateTransactionId()
  const walletCurrency = settlementWalletCurrencyForNoahCrypto(cryptoCurrency) as "USD" | "EUR"

  const quoted = input.quotedSession
  const quotedFormSessionId = String(quoted?.formSessionId || "").trim()
  const quotedChannelId = String(quoted?.channelId || channelId || "").trim()

  let formSessionId = ""
  let cryptoAuthorizedAmount = ""
  let resolvedChannelId = quotedChannelId || channelId

  // Always prepare at execute so the Noah form session matches this recipient row.
  // Client-quoted sessions are used for pricing/debit only — reusing a stale session
  // can route payouts to the wrong bank account when quotes were cached incorrectly.
  let prep: Awaited<ReturnType<typeof prepareSellFromRecipientRow>>
  try {
    prep = await prepareSellFromRecipientRow({
      row: recipientRow,
      fiatAmount,
      cryptoCurrency,
      noahCustomerId: ctx.noahCustomerId,
      overrides,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || "prepare_failed" }
  }

  formSessionId = String(prep.prep.formSessionId || "").trim()
  cryptoAuthorizedAmount = String(prep.prep.cryptoAuthorizedAmount || "").trim()
  resolvedChannelId = prep.channelId || resolvedChannelId

  if (quotedFormSessionId && quotedFormSessionId !== formSessionId) {
    console.warn("[noah_global_payout]", {
      stage: "execute_form_session_mismatch",
      recipientId: recipientId ?? null,
      quotedFormSessionIdPrefix: quotedFormSessionId.slice(0, 12),
      executeFormSessionIdPrefix: formSessionId.slice(0, 12),
    })
  }

  if (!formSessionId || !cryptoAuthorizedAmount) {
    return { ok: false, error: "Could not prepare payout session. Go back and get a fresh quote." }
  }

  const noahFloor = parsePositiveAmount(quoted?.noahFloor) ?? parsePositiveAmount(cryptoAuthorizedAmount)
  if (noahFloor == null) {
    return { ok: false, error: "Invalid crypto authorized amount from prepare." }
  }

  const marginCaptureMode =
    quoted?.marginCaptureMode ?? getGlobalPayoutMarginCaptureMode()
  try {
    await assertMarginCaptureModeReady(admin, marginCaptureMode, walletCurrency)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }

  const totalDebited =
    parsePositiveAmount(quoted?.totalDebited) ??
    parsePositiveAmount(quoted?.noahSendAmount) ??
    noahFloor
  const marginAmount =
    parsePositiveAmount(quoted?.marginAmount) ?? Math.max(0, totalDebited - noahFloor)
  // Explicit Easner 1% leg (uncapped). totalDebited = noahFloor + FX margin + processingFee,
  // so the fee is whatever the customer paid beyond the Noah floor + hidden FX margin.
  const processingFee = Math.max(
    0,
    Math.round((totalDebited - noahFloor - marginAmount) * 1_000_000) / 1_000_000,
  )
  const noahSendAmount =
    marginCaptureMode === "split_debit"
      ? noahFloor
      : (parsePositiveAmount(quoted?.noahSendAmount) ?? Math.max(0, totalDebited - processingFee))

  const { available, err: balErr } = await readAvailableBalance(admin, {
    businessId,
    userId: businessId ? null : userId,
    currency: walletCurrency,
  })
  if (balErr) return { ok: false, error: "insufficient_balance" }
  if (available < totalDebited) return { ok: false, error: "insufficient_balance" }

  const sourceAddress = (
    await resolveTurnkeyAddressForNoahPair(admin, ctx, cryptoCurrency, NOAH_OFFRAMP_NETWORK)
  )?.trim()
  if (!sourceAddress) {
    return { ok: false, error: "No Turnkey wallet found for this payout. Complete wallet setup first." }
  }

  const deposits = await getTurnkeyDepositAddressesForContext(admin, ctx)
  const depositLine = walletCurrency === "EUR" ? deposits.EUR : deposits.USD
  const senderAta = depositLine.address.trim()
  if (!senderAta || depositLine.ataReady !== true) {
    return { ok: false, error: "Your stablecoin deposit account is not ready yet. Try again shortly." }
  }

  const cryptoTrigger = pickTriggerCryptoAmount(cryptoAuthorizedAmount, cryptoAuthorizedAmount)

  let workflowRaw: Record<string, unknown>
  try {
    workflowRaw = await startOnchainDepositToPaymentWorkflow({
      customerId: ctx.noahCustomerId,
      cryptoCurrency,
      fiatAmount: fiatAmount.toFixed(2),
      formSessionId,
      externalId: easnerPayoutId,
      network: NOAH_OFFRAMP_NETWORK,
      sourceAddress,
      cryptoTriggerAmount: cryptoTrigger,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || "workflow_failed" }
  }

  const destinationAddress = pickDestinationAddress(workflowRaw)?.trim() || ""
  if (!destinationAddress) {
    console.warn("[noah_global_payout]", {
      stage: "workflow_missing_destination",
      responseKeys: Object.keys(workflowRaw),
      hasConditions: Array.isArray(workflowRaw.Conditions),
    })
    return { ok: false, error: "Noah did not return a deposit address for this payout." }
  }

  const noahWorkflowId = pickNoahWorkflowIdFromResponse(workflowRaw)
  resolvedChannelId = resolvedChannelId || channelId
  const asset = assetForCrypto(cryptoCurrency)
  const now = new Date().toISOString()

  const payoutReview = normalizePayoutReviewSnapshot(reviewSnapshotRaw)
  const recipientSnapshot = buildRecipientSnapshotFromRow(recipientRow)
  const noteFromOverrides = overrides?.note?.trim() || sendNote?.trim() || ""

  const pendingMetadata: Record<string, unknown> = {
    source: "api_noah_transfers",
    transaction_started_at: now,
    payout_type: "global_fiat",
    execution_model: "turnkey_workflow",
    easner_payout_id: easnerPayoutId,
    easner_transaction_id: easnerTransactionId,
    form_session_id: formSessionId,
    crypto_authorized_amount: cryptoAuthorizedAmount,
    noah_floor: noahFloor,
    noah_send_amount: noahSendAmount,
    total_debited: totalDebited,
    margin_amount: marginAmount,
    processing_fee: processingFee,
    margin_capture_mode: marginCaptureMode,
    ...(quoted?.customerRate != null ? { customer_rate: quoted.customerRate } : {}),
    ...(quoted?.noahMid != null ? { noah_mid: quoted.noahMid } : {}),
    ...(payoutReview?.noah_schedule_fee != null
      ? { noah_schedule_fee: payoutReview.noah_schedule_fee }
      : {}),
    ...(payoutReview?.noah_channel_fee != null
      ? { noah_channel_fee: payoutReview.noah_channel_fee }
      : {}),
    ...(payoutReview?.quote_noah_mid != null ? { quote_noah_mid: payoutReview.quote_noah_mid } : {}),
    crypto_asset: cryptoCurrency,
    fiat_currency: fiatCurrency,
    country_code: countryCode,
    receive_amount: fiatAmount,
    receive_currency: fiatCurrency,
    destination_address: destinationAddress,
    noah_workflow_id: noahWorkflowId,
    source_address: sourceAddress,
    recipient_snapshot: recipientSnapshot,
    ...(payoutReview ? { payout_review: payoutReview } : {}),
    ...(noteFromOverrides ? { send_note: noteFromOverrides, note: noteFromOverrides } : {}),
    ...(resolvedChannelId ? { channel_id: resolvedChannelId } : {}),
    ...(recipientId ? { recipient_id: recipientId } : {}),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  }

  await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "noah",
    providerTransactionId: pendingProviderTransactionId(easnerPayoutId),
    status: "pending",
    amount: totalDebited,
    currency: walletCurrency,
    direction: "out",
    payload: { workflowRaw, phase: "awaiting_chain_deposit" },
    metadata: pendingMetadata,
    occurredAt: now,
    asset: cryptoCurrency,
    baseCurrency: walletCurrency,
  })

  try {
    await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markGlobalPayoutExecuteFailed(admin, {
      easnerPayoutId,
      pendingMetadata,
      detail: msg || "wallet_reserve_failed",
    })
    return { ok: false, error: msg || "wallet_reserve_failed" }
  }

  let turnkeySendId: string | undefined
  let turnkeySendStatus: "pending" | "settled" | "failed" | undefined
  try {
    const send = await createTurnkeySend(admin, {
      ctx,
      asset,
      chain: "solana",
      destinationAddress,
      amount: noahSendAmount,
      settlementPollTimeoutMs: 0,
      globalPayout: {
        easnerPayoutId,
        noahWorkflowId,
        formSessionId,
        walletDebitAmount: totalDebited,
      },
    })
    turnkeySendId = send.providerTransactionId
    turnkeySendStatus = send.status

    let marginTurnkeySendId: string | undefined
    if (marginCaptureMode === "split_debit" && marginAmount > 0.000_001) {
      const poolAddress = await resolvePooledSolanaSourceAddress(admin, { ledgerCurrency: walletCurrency })
      if (!poolAddress) {
        throw new Error("Platform liquidity pool address is not configured for margin routing.")
      }
      const marginSend = await createTurnkeySend(admin, {
        ctx,
        asset,
        chain: "solana",
        destinationAddress: poolAddress,
        amount: marginAmount,
        settlementPollTimeoutMs: 0,
        globalPayout: {
          easnerPayoutId,
          noahWorkflowId,
          formSessionId,
          walletDebitAmount: 0,
          marginLeg: true,
        },
      })
      marginTurnkeySendId = marginSend.providerTransactionId
    }

    let processingFeeTurnkeySendId: string | undefined
    if (processingFee > 0.000_001) {
      const feeAddress = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: walletCurrency })
      if (!feeAddress) {
        throw new Error("wallet_send_fee_address_not_configured")
      }
      const feeSend = await createTurnkeySend(admin, {
        ctx,
        asset,
        chain: "solana",
        destinationAddress: feeAddress,
        amount: processingFee,
        settlementPollTimeoutMs: 0,
        globalPayout: {
          easnerPayoutId,
          noahWorkflowId,
          formSessionId,
          walletDebitAmount: 0,
          marginLeg: true,
        },
      })
      processingFeeTurnkeySendId = feeSend.providerTransactionId
    }

    await admin
      .from("transactions")
      .update({
        metadata: {
          ...pendingMetadata,
          turnkey_send_id: send.providerTransactionId,
          turnkey_tx_hash: send.txHash,
          turnkey_send_status: send.status,
          ...(marginTurnkeySendId ? { margin_turnkey_send_id: marginTurnkeySendId } : {}),
          ...(processingFeeTurnkeySendId
            ? { processing_fee_turnkey_send_id: processingFeeTurnkeySendId }
            : {}),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "noah")
      .eq("provider_transaction_id", pendingProviderTransactionId(easnerPayoutId))

    if (send.status === "failed") {
      const detail =
        send.chainFailureDetail?.trim() ||
        "Turnkey Solana broadcast failed. Check wallet USDC balance and try again."
      await markGlobalPayoutExecuteFailed(admin, {
        easnerPayoutId,
        pendingMetadata,
        detail,
        extraMetadata: { turnkey_send_id: send.providerTransactionId },
      })
      return { ok: false, error: detail }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markGlobalPayoutExecuteFailed(admin, {
      easnerPayoutId,
      pendingMetadata,
      detail: msg || "turnkey_send_failed",
    })
    return { ok: false, error: msg || "turnkey_send_failed" }
  }

  console.info("[noah_global_payout]", {
    country: countryCode,
    fiat: fiatCurrency,
    channelId: resolvedChannelId || null,
    formSessionIdPrefix: formSessionId.slice(0, 12),
    easnerPayoutId,
    executionModel: "turnkey_workflow",
    marginCaptureMode,
    totalDebited,
    noahSendAmount,
    turnkeySendId,
  })

  return {
    ok: true,
    easnerPayoutId,
    easnerTransactionId,
    status: "pending",
    turnkeySendId,
    turnkeySendStatus,
  }
}

export function cryptoCurrencyForBalanceCurrency(currency: string): string {
  const c = currency.trim().toUpperCase()
  if (c === "EUR") return getNoahEurCryptoTicker()
  return getNoahUsdCryptoTicker()
}
