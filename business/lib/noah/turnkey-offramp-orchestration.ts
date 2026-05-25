import type { SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"
import { pickNoahWorkflowIdFromResponse } from "@/lib/noah/bank-onramp-workflow"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"
import {
  pendingGlobalPayoutProviderTransactionId,
  settlementWalletCurrencyForNoahCrypto,
} from "@/lib/noah/global-payout-ledger"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { generateTransactionId } from "@/lib/transaction-id"
import {
  prepareSellFromRecipientRow,
  type RecipientSellPrepareRow,
  type SellPrepareOverrides,
} from "@/lib/terminal/recipient-sell-prepare"
import {
  pickDestinationAddress,
  pickTriggerCryptoAmount,
  startOnchainDepositToPaymentWorkflow,
} from "@/lib/terminal/automated-payout-workflow"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"

const NOAH_OFFRAMP_NETWORK = "Solana"

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

  const formSessionId = String(prep.prep.formSessionId || "").trim()
  const cryptoAuthorizedAmount = String(prep.prep.cryptoAuthorizedAmount || "").trim()
  if (!formSessionId || !cryptoAuthorizedAmount) {
    return { ok: false, error: "Could not prepare payout session. Go back and get a fresh quote." }
  }

  const cryptoAmount = Number.parseFloat(cryptoAuthorizedAmount)
  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    return { ok: false, error: "Invalid crypto authorized amount from prepare." }
  }

  const { available, err: balErr } = await readAvailableBalance(admin, {
    businessId,
    userId: businessId ? null : userId,
    currency: walletCurrency,
  })
  if (balErr) return { ok: false, error: "insufficient_balance" }
  if (available < cryptoAmount) return { ok: false, error: "insufficient_balance" }

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

  const cryptoTrigger = pickTriggerCryptoAmount(
    cryptoAuthorizedAmount,
    prep.prep.cryptoAmountEstimate || "",
  )

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
    return { ok: false, error: "Noah did not return a deposit address for this payout." }
  }

  const noahWorkflowId = pickNoahWorkflowIdFromResponse(workflowRaw)
  const resolvedChannelId = channelId || prep.channelId
  const asset = assetForCrypto(cryptoCurrency)
  const now = new Date().toISOString()

  const pendingMetadata: Record<string, unknown> = {
    source: "api_noah_transfers",
    payout_type: "global_fiat",
    execution_model: "turnkey_workflow",
    easner_payout_id: easnerPayoutId,
    easner_transaction_id: easnerTransactionId,
    form_session_id: formSessionId,
    crypto_authorized_amount: cryptoAuthorizedAmount,
    crypto_asset: cryptoCurrency,
    fiat_currency: fiatCurrency,
    country_code: countryCode,
    receive_amount: fiatAmount,
    receive_currency: fiatCurrency,
    destination_address: destinationAddress,
    noah_workflow_id: noahWorkflowId,
    source_address: sourceAddress,
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
    amount: cryptoAmount,
    currency: walletCurrency,
    direction: "out",
    payload: { workflowRaw, phase: "awaiting_chain_deposit" },
    metadata: pendingMetadata,
    occurredAt: now,
    asset: cryptoCurrency,
    baseCurrency: walletCurrency,
  })

  let turnkeySendId: string | undefined
  let turnkeySendStatus: "pending" | "settled" | "failed" | undefined
  try {
    const send = await createTurnkeySend(admin, {
      ctx,
      asset,
      chain: "solana",
      destinationAddress,
      amount: cryptoAmount,
      globalPayout: {
        easnerPayoutId,
        noahWorkflowId,
        formSessionId,
      },
    })
    turnkeySendId = send.providerTransactionId
    turnkeySendStatus = send.status

    await admin
      .from("transactions")
      .update({
        metadata: {
          ...pendingMetadata,
          turnkey_send_id: send.providerTransactionId,
          turnkey_tx_hash: send.txHash,
          turnkey_send_status: send.status,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "noah")
      .eq("provider_transaction_id", pendingProviderTransactionId(easnerPayoutId))

    if (send.status === "failed") {
      const detail =
        send.chainFailureDetail?.trim() ||
        "Turnkey Solana broadcast failed. Check wallet USDC balance and try again."
      await admin
        .from("transactions")
        .update({
          status: "failed",
          metadata: {
            ...pendingMetadata,
            turnkey_send_id: send.providerTransactionId,
            failure_reason: detail,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("provider", "noah")
        .eq("provider_transaction_id", pendingProviderTransactionId(easnerPayoutId))
      return { ok: false, error: detail }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin
      .from("transactions")
      .update({
        status: "failed",
        metadata: { ...pendingMetadata, failure_reason: msg },
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "noah")
      .eq("provider_transaction_id", pendingProviderTransactionId(easnerPayoutId))
    return { ok: false, error: msg || "turnkey_send_failed" }
  }

  console.info("[noah_global_payout]", {
    country: countryCode,
    fiat: fiatCurrency,
    channelId: resolvedChannelId || null,
    formSessionIdPrefix: formSessionId.slice(0, 12),
    easnerPayoutId,
    executionModel: "turnkey_workflow",
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
