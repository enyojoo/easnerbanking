import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTransactionId } from "@/lib/transaction-id"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import {
  applyGlobalPayoutWalletDebitForEasnerPayoutId,
  findGlobalPayoutNoahRowByEasnerPayoutId,
  pendingGlobalPayoutProviderTransactionId,
  reverseGlobalPayoutWalletDebitForEasnerPayoutId,
} from "@/lib/noah/global-payout-ledger"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import {
  buildRecipientSnapshotFromRow,
  normalizePayoutReviewSnapshot,
  type GlobalPayoutReviewSnapshot,
} from "@/lib/noah/build-payout-execute-snapshot"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import {
  getPayoutLockSession,
  markPayoutLockSessionExecuted,
} from "@/lib/payout/payout-lock-session"
import { executeBridgeBalancePayoutTurnkeyLeg } from "./payout-execute"
import { ensureBridgeExternalAccount } from "./external-accounts"
import { bridgeTransferDepositAddress, createBridgeOfframpTransfer } from "./transfers"
import { settlementAssetForPayoutProvider } from "@easner/shared"

export type ExecuteBridgeBalancePayoutInput = {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  recipientRow: RecipientSellPrepareRow
  recipientId: string
  destinationRef?: string
  fiatAmount: number
  fiatCurrency: string
  countryCode: string
  idempotencyKey?: string
  reviewSnapshot?: GlobalPayoutReviewSnapshot | null
  sendNote?: string
  lockId?: string
  sourceBalanceCurrency: string
  bridge: {
    customerId?: string
    externalAccountId?: string
    cryptoAmount?: number
    fundingAddress?: string
    sequenceId?: string
  }
  pricing: {
    totalDebited: number
    customerPrincipal: number
    marginAmount: number
    processingFee: number
    channelCost: number
    customerRate?: number
  }
}

export type ExecuteBridgeBalancePayoutResult =
  | {
      ok: true
      easnerPayoutId: string
      easnerTransactionId: string
      status: "pending" | "failed"
      turnkeySendId?: string | null
    }
  | { ok: false; error: string }

async function resolveBridgeCustomerId(
  admin: SupabaseClient,
  input: { userId: string; businessId: string | null },
): Promise<string> {
  if (input.businessId) {
    const { data } = await admin
      .from("businesses")
      .select("bridge_customer_id,bridge_kyc_status")
      .eq("id", input.businessId)
      .maybeSingle()
    const id = String(data?.bridge_customer_id ?? "").trim()
    const status = String(data?.bridge_kyc_status ?? "").trim().toLowerCase()
    if (!id || status !== "approved") {
      throw new Error("Complete EUR and USD bank verification before sending this payout.")
    }
    return id
  }
  const { data } = await admin
    .from("users")
    .select("bridge_customer_id,bridge_kyc_status,verification_provider,verification_status")
    .eq("id", input.userId)
    .maybeSingle()
  const id = String(data?.bridge_customer_id ?? "").trim()
  const approved =
    String(data?.bridge_kyc_status ?? "").toLowerCase() === "approved" ||
    (String(data?.verification_provider ?? "").toLowerCase() === "bridge" &&
      String(data?.verification_status ?? "").toLowerCase() === "approved")
  if (!id || !approved) {
    throw new Error("Complete bank account verification before sending this payout.")
  }
  return id
}

export async function executeBridgeBalancePayout(
  input: ExecuteBridgeBalancePayoutInput,
): Promise<ExecuteBridgeBalancePayoutResult> {
  const { admin, userId, businessId, recipientRow, recipientId, fiatAmount, fiatCurrency } = input
  const sourceBalanceCurrency = String(input.sourceBalanceCurrency || "USD").trim().toUpperCase()
  const totalDebited = Number(input.pricing.totalDebited)
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) {
    return { ok: false, error: "Invalid total debited for payout." }
  }

  const lockId = String(input.lockId || "").trim()
  let customerId = String(input.bridge.customerId || "").trim()
  let externalAccountId = String(input.bridge.externalAccountId || "").trim()
  let cryptoAmount = Number(input.bridge.cryptoAmount ?? input.pricing.customerPrincipal)
  let fundingAddress = String(input.bridge.fundingAddress || "").trim()
  let sequenceId = String(input.bridge.sequenceId || "").trim()
  if (lockId) {
    const lockRow = await getPayoutLockSession(admin, { lockId, userId })
    const payload = lockRow?.provider_payload_json ?? {}
    if (!customerId) customerId = String(payload.customerId ?? "").trim()
    if (!externalAccountId) externalAccountId = String(payload.externalAccountId ?? "").trim()
    if (!(cryptoAmount > 0)) cryptoAmount = Number(payload.cryptoAmount ?? 0)
    if (!fundingAddress) fundingAddress = String(payload.fundingAddress ?? "").trim()
    if (!sequenceId) sequenceId = String(payload.sequenceId ?? "").trim()
  }

  try {
    if (!customerId) {
      customerId = await resolveBridgeCustomerId(admin, { userId, businessId })
    }
    if (!externalAccountId) {
      externalAccountId = await ensureBridgeExternalAccount({
        admin,
        customerId,
        recipient: recipientRow,
        recipientId,
        accountOwnerType: businessId ? "business" : "individual",
        idempotencyKey: `bridge-ea:${businessId ?? userId}:${recipientId}`,
      })
    }
    const transfer = await createBridgeOfframpTransfer({
      customerId,
      externalAccountId,
      recipient: recipientRow,
      cryptoAmount,
      idempotencyKey: `bridge-xfer:${businessId ?? userId}:${input.idempotencyKey || recipientId}:${cryptoAmount}`,
    })
    if (!fundingAddress) fundingAddress = bridgeTransferDepositAddress(transfer)
    if (!sequenceId) sequenceId = String(transfer.id || "").trim()
    if (!fundingAddress) {
      return { ok: false, error: "Payout funding instructions are unavailable. Try again shortly." }
    }

    const easnerPayoutId = randomUUID()
    const easnerTransactionId = generateTransactionId()
    const now = new Date().toISOString()
    const reviewSnapshot = normalizePayoutReviewSnapshot(input.reviewSnapshot)
    const recipientSnapshot = buildRecipientSnapshotFromRow(recipientRow)
    const asset = settlementAssetForPayoutProvider("bridge", fiatCurrency) === "EURC" ? "EURC" : "USDC"
    const pendingPtid = pendingGlobalPayoutProviderTransactionId(easnerPayoutId)
    const metadata: Record<string, unknown> = {
      flow: "balance_payout",
      payout_provider: "bridge",
      easner_payout_id: easnerPayoutId,
      easner_transaction_id: easnerTransactionId,
      bridge_transfer_id: transfer.id,
      bridge_customer_id: customerId,
      bridge_external_account_id: externalAccountId,
      fiat_amount: fiatAmount,
      fiat_currency: fiatCurrency,
      country_code: input.countryCode,
      destination_ref: input.destinationRef || `recipient:${recipientId}`,
      recipient_snapshot: recipientSnapshot,
      review_snapshot: reviewSnapshot,
      send_note: input.sendNote ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      funding_address: fundingAddress,
      crypto_authorized_amount: cryptoAmount,
      total_debited: totalDebited,
      customer_principal: input.pricing.customerPrincipal,
      margin_amount: input.pricing.marginAmount,
      processing_fee: input.pricing.processingFee,
      channel_cost: input.pricing.channelCost,
      customer_rate: input.pricing.customerRate ?? null,
    }

    const upsert = await upsertLedgerTransaction(admin, {
      userId,
      businessId,
      provider: "bridge",
      providerTransactionId: pendingPtid,
      status: "pending",
      amount: totalDebited,
      currency: sourceBalanceCurrency,
      direction: "out",
      payload: { phase: "awaiting_chain_deposit", bridge_transfer_id: transfer.id },
      metadata,
      occurredAt: now,
      baseCurrency: sourceBalanceCurrency,
      asset,
    })
    const transactionId = upsert.transactionId
    if (!transactionId) return { ok: false, error: "failed_to_create_payout_ledger_row" }

    await admin
      .from("transactions")
      .update({ easner_transaction_id: easnerTransactionId, updated_at: now })
      .eq("id", transactionId)

    await admin.from("bridge_transfers").insert({
      transaction_id: transactionId,
      user_id: userId,
      business_id: businessId,
      mode: "balance_payout",
      status: "pending",
      pay_in_currency: sourceBalanceCurrency,
      receive_currency: fiatCurrency,
      quoted_pay_in: totalDebited,
      quoted_receive: fiatAmount,
      bridge_transfer_id: transfer.id,
      external_account_id: externalAccountId,
      bridge_customer_id: customerId,
      settlement_info: { fundingAddress, cryptoAmount },
      metadata: { easner_payout_id: easnerPayoutId },
    })

    try {
      await applyGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId })
      const debited = await findGlobalPayoutNoahRowByEasnerPayoutId(admin, easnerPayoutId)
      if (debited?.metadata.balance_delta_applied !== true) {
        throw new Error("wallet_debit_failed")
      }
    } catch (e) {
      const debitError = e instanceof Error ? e.message : "wallet_debit_failed"
      await upsertLedgerTransaction(admin, {
        userId,
        businessId,
        provider: "bridge",
        providerTransactionId: pendingPtid,
        status: "failed",
        amount: totalDebited,
        currency: sourceBalanceCurrency,
        direction: "out",
        metadata: { ...metadata, failure_reason: debitError },
        occurredAt: now,
        baseCurrency: sourceBalanceCurrency,
        asset,
      })
      return { ok: false, error: debitError }
    }

    const ctx = await resolveNoahAccountContextFromLedgerScope(admin, {
      userId,
      businessId,
    })
    if (!ctx) {
      return { ok: false, error: "Could not resolve wallet context for payout." }
    }
    const chainSend = await executeBridgeBalancePayoutTurnkeyLeg({
      admin,
      ctx,
      transactionId,
      easnerPayoutId,
      fundingAddress,
      cryptoAmount,
      totalDebited,
      formSessionId: sequenceId || transfer.id,
      receiveCurrency: fiatCurrency,
      sourceBalanceCurrency,
    })
    if (!chainSend.ok) {
      await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, { easnerPayoutId }).catch(() => {})
      await upsertLedgerTransaction(admin, {
        userId,
        businessId,
        provider: "bridge",
        providerTransactionId: pendingPtid,
        status: "failed",
        amount: totalDebited,
        currency: sourceBalanceCurrency,
        direction: "out",
        metadata: { ...metadata, failure_reason: chainSend.error },
        occurredAt: now,
        baseCurrency: sourceBalanceCurrency,
        asset,
      })
      return { ok: false, error: chainSend.error || "Payout funding transfer failed." }
    }

    await upsertLedgerTransaction(admin, {
      userId,
      businessId,
      provider: "bridge",
      providerTransactionId: pendingPtid,
      status: "processing",
      amount: totalDebited,
      currency: sourceBalanceCurrency,
      direction: "out",
      metadata: {
        ...metadata,
        turnkey_send_id: chainSend.turnkeySendId,
        bridge_funding_tx_hash: chainSend.txHash,
      },
      occurredAt: now,
      txHash: chainSend.txHash ?? undefined,
      baseCurrency: sourceBalanceCurrency,
      asset,
    })
    await admin
      .from("bridge_transfers")
      .update({ status: "processing", updated_at: now })
      .eq("transaction_id", transactionId)
      .eq("mode", "balance_payout")
    if (lockId) {
      await markPayoutLockSessionExecuted(admin, lockId).catch(() => {})
    }
    return {
      ok: true,
      easnerPayoutId,
      easnerTransactionId,
      status: "pending",
      turnkeySendId: chainSend.turnkeySendId ?? null,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Payout failed." }
  }
}
