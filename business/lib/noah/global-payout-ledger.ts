/** Ledger field mapping for Noah global fiat payouts (no @easner/shared imports). */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  formatNoahAccountHolderName,
  pickNoahOrchestrationRuleExecutionId,
} from "@/lib/noah/bank-onramp-tx"

export function pendingGlobalPayoutProviderTransactionId(easnerPayoutId: string): string {
  return `global_payout_pending:${easnerPayoutId}`
}

export function isNoahGlobalPayoutSellTx(tx: Record<string, unknown>): boolean {
  if (String(tx.Direction ?? "").toUpperCase() !== "OUT") return false
  if (!tx.FiatPayment || typeof tx.FiatPayment !== "object") return false
  return Boolean(String(tx.CryptoCurrency ?? "").trim())
}

/**
 * Noah received USDC/EURC from Turnkey before fiat payout — internal orchestration leg, not user-facing credit.
 * Mirrors bank-on-ramp orchestration Out (Solana) which we suppress on the other side of the flow.
 */
export function isNoahGlobalPayoutOrchestrationInLeg(tx: Record<string, unknown>): boolean {
  if (String(tx.Direction ?? "").toUpperCase() !== "IN") return false
  if (!pickNoahOrchestrationRuleExecutionId(tx)) return false
  if (tx.FiatPayment) return false
  const net = String(tx.Network ?? "")
  if (!net || net === "OffNetwork") return false
  const crypto = String(tx.CryptoCurrency ?? "").toUpperCase()
  if (!crypto.includes("USDC") && !crypto.includes("EURC")) return false
  const externalId = String(tx.ExternalID ?? tx.externalID ?? tx.ExternalId ?? "").trim()
  return Boolean(externalId)
}

export type NoahGlobalPayoutPayOutEnrichment = {
  beneficiaryName: string | null
  bankName: string | null
  accountNumber: string | null
  bankCode: string | null
  countryCode: string | null
  receiveAmount: number
  receiveCurrency: string
  fxRate: string | null
}

/** Beneficiary / bank fields from Noah OffNetwork OUT webhook (user-facing payout row). */
export function extractNoahGlobalPayoutPayOutEnrichment(
  tx: Record<string, unknown>,
): NoahGlobalPayoutPayOutEnrichment | null {
  if (!isNoahGlobalPayoutSellTx(tx)) return null
  const fp = tx.FiatPayment as Record<string, unknown> | undefined
  const fpm = tx.FiatPaymentMethod as Record<string, unknown> | undefined
  const issuer = fpm?.IssuerDetails as Record<string, unknown> | undefined
  const display = fpm?.DisplayDetails as Record<string, unknown> | undefined
  const holder = fpm?.AccountHolderDetails as Record<string, unknown> | undefined
  const receiveAmount = Math.abs(parseFloat(String(fp?.Amount ?? "0")) || 0)
  const receiveCurrency = String(fp?.FiatCurrency ?? "USD").toUpperCase()
  return {
    beneficiaryName: formatNoahAccountHolderName(holder),
    bankName:
      issuer?.Name != null && String(issuer.Name).trim() ? String(issuer.Name).trim() : null,
    accountNumber:
      display?.AccountNumber != null && String(display.AccountNumber).trim()
        ? String(display.AccountNumber).trim()
        : null,
    bankCode:
      display?.BankCode != null && String(display.BankCode).trim()
        ? String(display.BankCode).trim()
        : null,
    countryCode:
      fpm?.Country != null && String(fpm.Country).trim() ? String(fpm.Country).trim() : null,
    receiveAmount,
    receiveCurrency,
    fxRate: fp?.Rate != null && String(fp.Rate).trim() ? String(fp.Rate).trim() : null,
  }
}

export function buildNoahGlobalPayoutPayOutMetadata(
  tx: Record<string, unknown>,
  enrichment: NoahGlobalPayoutPayOutEnrichment,
): Record<string, unknown> {
  return {
    flow: "global_fiat_offramp",
    ...(enrichment.beneficiaryName
      ? {
          beneficiary_name: enrichment.beneficiaryName,
          recipient_name: enrichment.beneficiaryName,
          counterparty_name: enrichment.beneficiaryName,
        }
      : {}),
    ...(enrichment.bankName ? { bank_name: enrichment.bankName } : {}),
    ...(enrichment.accountNumber ? { account_number: enrichment.accountNumber } : {}),
    ...(enrichment.bankCode ? { bank_code: enrichment.bankCode } : {}),
    ...(enrichment.countryCode ? { country_code: enrichment.countryCode } : {}),
    ...(enrichment.fxRate ? { fx_rate: enrichment.fxRate } : {}),
    payment_rail: "bank",
    destination_payment_rail: "bank",
  }
}

export function settlementWalletCurrencyForNoahCrypto(crypto: string): string {
  const c = crypto.trim().toUpperCase()
  if (c.includes("USDC") || c === "USD") return "USD"
  if (c.includes("EURC") || c === "EUR") return "EUR"
  return c
}

function pickPositiveAmount(raw: unknown): number | null {
  const n = Math.abs(parseFloat(String(raw ?? "")))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function pickNoahCryptoDebitAmount(tx: Record<string, unknown>): number | null {
  for (const key of ["CryptoAmount", "Amount", "CryptoAuthorizedAmount", "TotalAmount"]) {
    const n = pickPositiveAmount(tx[key])
    if (n != null) return n
  }
  const cp = tx.CryptoPayment as Record<string, unknown> | undefined
  if (cp) {
    const n = pickPositiveAmount(cp.Amount ?? cp.amount)
    if (n != null) return n
  }
  return null
}

export type NoahGlobalPayoutLedgerFields = {
  amount: number
  currency: string
  baseCurrency: string
  asset: string | null
  receiveAmount: number
  receiveCurrency: string
}

/**
 * Ledger columns for global fiat payouts:
 * - amount/currency/base_* = wallet debit (USD balance / USDC settlement)
 * - receiveAmount/receiveCurrency = beneficiary fiat (NGN, etc.)
 */
export function pickNoahGlobalPayoutLedgerFields(
  tx: Record<string, unknown>,
  hints?: { cryptoAuthorizedAmount?: string; sourceBalanceCurrency?: string },
): NoahGlobalPayoutLedgerFields {
  const fp = tx.FiatPayment as Record<string, unknown> | undefined
  const receiveAmount = Math.abs(parseFloat(String(fp?.Amount ?? "0")) || 0)
  const receiveCurrency = String(fp?.FiatCurrency ?? "USD").toUpperCase()
  const asset = String(tx.CryptoCurrency ?? "").trim() || null

  let cryptoAmount = pickNoahCryptoDebitAmount(tx)
  if (cryptoAmount == null && hints?.cryptoAuthorizedAmount) {
    cryptoAmount = pickPositiveAmount(hints.cryptoAuthorizedAmount)
  }

  const baseCurrency =
    String(hints?.sourceBalanceCurrency ?? "").trim().toUpperCase() ||
    (asset ? settlementWalletCurrencyForNoahCrypto(asset) : "USD")

  return {
    amount: cryptoAmount ?? 0,
    currency: baseCurrency,
    baseCurrency,
    asset,
    receiveAmount,
    receiveCurrency,
  }
}

export async function findPendingGlobalPayoutByExternalId(
  admin: SupabaseClient,
  externalId: string,
): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const key = String(externalId || "").trim()
  if (!key) return null

  const pendingPtid = pendingGlobalPayoutProviderTransactionId(key)
  const { data: byPtid } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "noah")
    .eq("provider_transaction_id", pendingPtid)
    .maybeSingle()
  if (byPtid?.id) {
    return { id: String(byPtid.id), metadata: (byPtid.metadata || {}) as Record<string, unknown> }
  }

  const { data: byMeta } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "noah")
    .contains("metadata", { easner_payout_id: key })
    .maybeSingle()
  if (byMeta?.id) {
    return { id: String(byMeta.id), metadata: (byMeta.metadata || {}) as Record<string, unknown> }
  }

  return null
}

/** Skip duplicate chain-ingest debit when Turnkey global payout settlement already handled balance. */
export async function findGlobalPayoutSettlementForChainSuppression(
  admin: SupabaseClient,
  input: { turnkeySendStatusId?: string | null; txHash?: string | null },
): Promise<{ easnerPayoutId: string } | null> {
  const tid = String(input.turnkeySendStatusId || "").trim()
  if (tid) {
    const { data } = await admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "turnkey")
      .eq("provider_transaction_id", tid)
      .maybeSingle()
    const meta = (data?.metadata || {}) as Record<string, unknown>
    if (meta.global_payout_settlement_leg === true) {
      const easnerPayoutId = String(meta.easner_payout_id || "").trim()
      if (easnerPayoutId) return { easnerPayoutId }
    }
  }

  const hx = String(input.txHash || "").trim()
  if (hx) {
    const { data } = await admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "turnkey")
      .eq("tx_hash", hx)
      .maybeSingle()
    const meta = (data?.metadata || {}) as Record<string, unknown>
    if (meta.global_payout_settlement_leg === true) {
      const easnerPayoutId = String(meta.easner_payout_id || "").trim()
      if (easnerPayoutId) return { easnerPayoutId }
    }
  }

  return null
}

export async function linkPendingGlobalPayoutToNoahTransactionId(
  admin: SupabaseClient,
  input: { pendingRowId: string; noahTransactionId: string },
): Promise<void> {
  await admin
    .from("transactions")
    .update({
      provider_transaction_id: input.noahTransactionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.pendingRowId)
}

/** Attach Solana orchestration IN leg to the user-facing global payout OUT row; do not create a separate IN ledger row. */
export async function linkGlobalPayoutOutRowFromOrchestrationIn(
  admin: SupabaseClient,
  input: {
    outRowId: string
    priorMetadata: Record<string, unknown>
    ruleExecutionId: string | null
    solanaTxHash: string | null
  },
): Promise<void> {
  const patch: Record<string, unknown> = {
    ...input.priorMetadata,
    flow: "global_fiat_offramp",
    global_payout_orchestration_in_leg_linked: true,
  }
  if (input.ruleExecutionId) {
    patch.noah_rule_execution_id = input.ruleExecutionId
  }
  if (input.solanaTxHash) {
    patch.noah_on_chain_tx_hash = input.solanaTxHash
    if (!patch.turnkey_tx_hash) {
      patch.turnkey_tx_hash = input.solanaTxHash
    }
  }
  await admin
    .from("transactions")
    .update({
      metadata: patch,
      ...(input.solanaTxHash ? { tx_hash: input.solanaTxHash } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.outRowId)
}
