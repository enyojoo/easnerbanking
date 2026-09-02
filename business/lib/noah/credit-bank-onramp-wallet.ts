import type { SupabaseClient } from "@supabase/supabase-js"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { ledgerAmountToUsd, maybeApplyVelocityControl } from "@/lib/wallet-send-compliance"
import {
  extractNoahBankPayInEnrichment,
  isNoahBankOnrampOrchestrationOutLeg,
  pickNoahOrchestrationRuleExecutionId,
  type NoahBankPayInEnrichment,
} from "@/lib/noah/bank-onramp-tx"
import { findBankOnrampPayInTransaction } from "@/lib/noah/find-bank-onramp-pay-in-transaction"
import { notifyBankDepositPayInSettledPush } from "@/lib/notifications/bank-deposit-settled-notify"
import { mergeBankDepositLifecycleMetadata } from "@/lib/noah/bank-onramp-tx"
import { pickNoahOnChainTxHashFromLedgerRow } from "@/lib/noah/noah-on-chain-tx-hash"
import { isDepositSplitEnabled } from "@/lib/deposit-omnibus/config"
import { triggerDepositSplitFromOrchestrationOut } from "@/lib/deposit-omnibus/handle-omnibus-inbound"
import { suppressTurnkeyNoahChainMirrorRow } from "@/lib/noah/turnkey-chain-mirror"

function applyLedgerScope<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  scope: { userId: string; businessId: string | null },
): T {
  if (scope.businessId) return query.eq("business_id", scope.businessId)
  return query.eq("user_id", scope.userId).is("business_id", null)
}

/** True when a Turnkey inbound row actually moved `wallet_balances` (not a mirror backfill row). */
export function turnkeyInboundAppliedBalanceDelta(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const m = metadata as Record<string, unknown>
  if (typeof m.wallet_balance_credit_key === "string" && m.wallet_balance_credit_key.trim()) {
    return true
  }
  if (m.balance_delta_applied === true) return true
  if (m.source === "turnkey_onchain_backfill") return false
  if (m.noah_bank_onramp_chain_mirror === true) return false
  return m.source === "turnkey_webhook"
}

export function buildNoahBankOnrampCreditKey(ruleExecutionId: string | null, noahTransactionId: string): string {
  return ruleExecutionId ? `noah_bank_onramp:${ruleExecutionId}` : `noah_bank_onramp:${noahTransactionId}`
}

async function turnkeySettledInboundAppliedBalanceForHashes(
  admin: SupabaseClient,
  hashes: string[],
  scope: { userId: string; businessId: string | null },
): Promise<boolean> {
  const wanted = [...new Set(hashes.map((h) => String(h).trim()).filter(Boolean))]
  if (!wanted.length) return false

  let q = admin
    .from("transactions")
    .select("metadata")
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .eq("status", "settled")
    .in("tx_hash", wanted)
  q = applyLedgerScope(q, scope)
  const { data: rows } = await q.limit(8)
  for (const row of rows ?? []) {
    if (turnkeyInboundAppliedBalanceDelta(row.metadata)) return true
  }
  return false
}

export type CreditNoahBankOnrampInput = {
  transactionId: string
  userId: string
  businessId: string | null
  noahTransactionId: string
  ruleExecutionId: string | null
  payInEnrichment: NoahBankPayInEnrichment
  metadata: Record<string, unknown>
  /** Real Solana signature when known (orchestration Out / chain ingest). */
  solanaTxHash?: string | null
}

/**
 * Idempotently credit `wallet_balances` for a settled Noah bank on-ramp pay-in.
 * Turnkey mirror rows from on-chain backfill must not block this credit.
 */
export async function tryCreditNoahBankOnrampPayInWallet(
  admin: SupabaseClient,
  input: CreditNoahBankOnrampInput,
): Promise<{ credited: boolean; skippedReason?: string }> {
  if (isDepositSplitEnabled()) {
    return { credited: false, skippedReason: "deferred_to_split" }
  }
  const enrichment = input.payInEnrichment
  if (
    enrichment.settledStablecoinAmount == null ||
    enrichment.settledStablecoinAmount <= 0 ||
    !enrichment.walletLedgerCurrency
  ) {
    return { credited: false, skippedReason: "no_settled_amount" }
  }

  const creditKey = buildNoahBankOnrampCreditKey(input.ruleExecutionId, input.noahTransactionId)
  const { data: priorCredit } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", input.transactionId)
    .maybeSingle()
  const priorMeta = (priorCredit?.metadata as Record<string, unknown> | undefined) ?? {}
  if (priorMeta.wallet_balance_credit_key === creditKey) {
    return { credited: false, skippedReason: "already_credited" }
  }

  const solanaTxHash = String(input.solanaTxHash ?? "").trim()
  if (solanaTxHash) {
    await suppressTurnkeyNoahChainMirrorRow(admin, {
      txHash: solanaTxHash,
      userId: input.userId,
      businessId: input.businessId,
    }).catch(() => ({ suppressed: 0, reversedBalance: 0 }))
  }

  const hashCandidates = [
    input.solanaTxHash,
    enrichment.onChainTxHash,
    typeof priorMeta.noah_on_chain_tx_hash === "string" ? priorMeta.noah_on_chain_tx_hash : null,
  ].filter((h): h is string => Boolean(h && String(h).trim()))

  const chainAlreadyCredited = await turnkeySettledInboundAppliedBalanceForHashes(admin, hashCandidates, {
    userId: input.userId,
    businessId: input.businessId,
  })

  if (chainAlreadyCredited) {
    await admin
      .from("transactions")
      .update({
        metadata: { ...priorMeta, ...input.metadata, wallet_balance_credit_key: creditKey },
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.transactionId)
    return { credited: false, skippedReason: "turnkey_already_credited" }
  }

  await applyWalletBalanceDelta(admin, {
    businessId: input.businessId ? input.businessId : null,
    userId: input.businessId ? null : input.userId,
    currency: enrichment.walletLedgerCurrency,
    delta: enrichment.settledStablecoinAmount,
  })

  await maybeApplyVelocityControl(admin, {
    businessId: input.businessId,
    amountUsd: ledgerAmountToUsd(enrichment.settledStablecoinAmount, enrichment.walletLedgerCurrency),
    source: "noah_bank_onramp",
    transactionId: input.transactionId,
    creditKey,
  })

  await admin
    .from("transactions")
    .update({
      metadata: { ...priorMeta, ...input.metadata, wallet_balance_credit_key: creditKey },
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.transactionId)

  return { credited: true }
}

/**
 * Bank on-ramp orchestration Out (Noah → user wallet): side effects only.
 * The fiat pay-in Noah Transaction row is the sole user-facing ledger record.
 */
export async function applyNoahBankOnrampOrchestrationOutSideEffects(
  admin: SupabaseClient,
  opts: {
    txData: Record<string, unknown>
    status: string
    userId: string
    businessId: string | null
    occurredAt?: string | null
  },
): Promise<void> {
  if (!isNoahBankOnrampOrchestrationOutLeg(opts.txData)) return
  const ruleExecutionId = pickNoahOrchestrationRuleExecutionId(opts.txData)
  if (String(opts.status).toLowerCase() !== "settled" || !ruleExecutionId) return

  const solanaTxHash = pickNoahOnChainTxHashFromLedgerRow({ payload: opts.txData })
  if (!solanaTxHash) return

  const onChainSettledAt =
    typeof opts.occurredAt === "string" && opts.occurredAt.trim()
      ? opts.occurredAt.trim()
      : null

  const payIn = await patchBankOnrampPayInOnChainSettled(admin, {
    ruleExecutionId,
    solanaTxHash,
    onChainSettledAt,
    userId: opts.userId,
    businessId: opts.businessId,
  })

  if (isDepositSplitEnabled()) {
    await triggerDepositSplitFromOrchestrationOut(admin, {
      ruleExecutionId,
      userId: opts.userId,
      businessId: opts.businessId,
      solanaTxHash,
      amount: Number(opts.txData.Amount ?? 0) || null,
    })
    return
  }

  await reconcileNoahBankOnrampCreditForSolanaTx(admin, {
    solanaTxHash,
    userId: opts.userId,
    businessId: opts.businessId,
  })
  if (payIn?.id) {
    await notifyBankDepositPayInSettledPush(admin, payIn.id)
  }
}

/** Persist orchestration Out Settled time on the user-facing pay-in row. */
export async function patchBankOnrampPayInOnChainSettled(
  admin: SupabaseClient,
  opts: {
    ruleExecutionId: string
    solanaTxHash: string
    onChainSettledAt: string | null
    userId: string
    businessId: string | null
  },
): Promise<{ id: string } | null> {
  const ruleExecutionId = String(opts.ruleExecutionId || "").trim()
  const solanaTxHash = String(opts.solanaTxHash || "").trim()
  if (!ruleExecutionId || !solanaTxHash) return null

  const payIn = await findBankOnrampPayInTransaction(admin, {
    depositId: ruleExecutionId,
    userId: opts.userId,
    businessId: opts.businessId,
  })
  if (!payIn?.id) return null

  const merged = mergeBankDepositLifecycleMetadata(
    payIn.metadata,
    isDepositSplitEnabled()
      ? {}
      : { on_chain_settled_at: opts.onChainSettledAt },
  )

  await admin
    .from("transactions")
    .update({
      metadata: { ...merged, noah_on_chain_tx_hash: solanaTxHash },
      tx_hash: solanaTxHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payIn.id)

  return { id: payIn.id }
}

/** Attach the Solana settlement signature to the fiat pay-in row for mirror suppression. */
export async function linkBankOnrampPayInToSolanaTxHash(
  admin: SupabaseClient,
  opts: {
    ruleExecutionId: string
    solanaTxHash: string
    userId: string
    businessId: string | null
  },
): Promise<void> {
  const solanaTxHash = String(opts.solanaTxHash || "").trim()
  const ruleExecutionId = String(opts.ruleExecutionId || "").trim()
  if (!solanaTxHash || !ruleExecutionId) return

  const payIn = await findBankOnrampPayInTransaction(admin, {
    depositId: ruleExecutionId,
    userId: opts.userId,
    businessId: opts.businessId,
  })
  if (!payIn?.id) return

  await patchBankOnrampPayInOnChainSettled(admin, {
    ruleExecutionId,
    solanaTxHash,
    onChainSettledAt: null,
    userId: opts.userId,
    businessId: opts.businessId,
  })
}

/**
 * After Turnkey on-chain ingest (ledger-only) or orchestration settle, credit the Noah pay-in if due.
 */
export async function reconcileNoahBankOnrampCreditForSolanaTx(
  admin: SupabaseClient,
  opts: {
    solanaTxHash: string
    userId: string
    businessId: string | null
  },
): Promise<{ credited: boolean }> {
  const solanaTxHash = String(opts.solanaTxHash || "").trim()
  if (!solanaTxHash) return { credited: false }

  const select = "id, status, metadata, payload, provider_transaction_id"

  let byHash = admin
    .from("transactions")
    .select(select)
    .eq("provider", "noah")
    .eq("direction", "in")
    .eq("status", "settled")
    .eq("tx_hash", solanaTxHash)
  byHash = applyLedgerScope(byHash, opts)
  let { data: payInRow } = await byHash.maybeSingle()

  if (!payInRow?.id) {
    let byMeta = admin
      .from("transactions")
      .select(select)
      .eq("provider", "noah")
      .eq("direction", "in")
      .eq("status", "settled")
      .filter("metadata->>noah_on_chain_tx_hash", "eq", solanaTxHash)
    byMeta = applyLedgerScope(byMeta, opts)
    const res = await byMeta.maybeSingle()
    payInRow = res.data
  }

  if (!payInRow?.id) {
    let byOrch = admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "noah")
      .eq("direction", "out")
      .eq("tx_hash", solanaTxHash)
    byOrch = applyLedgerScope(byOrch, opts)
    const { data: orchRow } = await byOrch.maybeSingle()
    const ruleId =
      orchRow?.metadata && typeof orchRow.metadata === "object"
        ? String((orchRow.metadata as Record<string, unknown>).noah_rule_execution_id ?? "").trim()
        : ""
    if (ruleId) {
      const linked = await findBankOnrampPayInTransaction(admin, {
        depositId: ruleId,
        userId: opts.userId,
        businessId: opts.businessId,
      })
      if (linked?.id) {
        const { data: full } = await admin
          .from("transactions")
          .select(select)
          .eq("id", linked.id)
          .maybeSingle()
        payInRow = full
      }
    }
  }

  if (!payInRow?.id || String(payInRow.status ?? "").toLowerCase() !== "settled") {
    return { credited: false }
  }

  const payload = (payInRow.payload as Record<string, unknown> | undefined) ?? {}
  const enrichment = extractNoahBankPayInEnrichment(payload)
  if (!enrichment) return { credited: false }

  const meta = (payInRow.metadata as Record<string, unknown> | undefined) ?? {}
  const ruleExecutionId =
    (typeof meta.noah_rule_execution_id === "string" && meta.noah_rule_execution_id.trim()) ||
    enrichment.ruleExecutionId ||
    null

  const result = await tryCreditNoahBankOnrampPayInWallet(admin, {
    transactionId: String(payInRow.id),
    userId: opts.userId,
    businessId: opts.businessId,
    noahTransactionId: String(payInRow.provider_transaction_id ?? payInRow.id),
    ruleExecutionId,
    payInEnrichment: enrichment,
    metadata: meta,
    solanaTxHash,
  })
  return { credited: result.credited }
}

const DEFAULT_RECONCILE_LOOKBACK_DAYS = 30

/**
 * Owner-scoped pass: credit settled Noah bank pay-ins that have on-chain hash but no wallet credit yet.
 * Safe to run on every `sync-chain-ledger` (including cooldown).
 */
export async function reconcileNoahBankOnrampCreditsForOwner(
  admin: SupabaseClient,
  opts: {
    userId: string
    businessId: string | null
    sinceDays?: number
  },
): Promise<{ attempted: number; credited: number }> {
  const sinceDays = opts.sinceDays ?? DEFAULT_RECONCILE_LOOKBACK_DAYS
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  let q = admin
    .from("transactions")
    .select("id, metadata, tx_hash, payload, provider_transaction_id, status")
    .eq("provider", "noah")
    .eq("direction", "in")
    .eq("status", "settled")
    .gte("created_at", sinceIso)
    .or("metadata->>flow.eq.bank_onramp,metadata->>noah_rule_execution_id.not.is.null")
  q = applyLedgerScope(q, opts)

  const { data: rows } = await q.limit(50)
  let attempted = 0
  let credited = 0

  for (const row of rows ?? []) {
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    if (typeof meta.wallet_balance_credit_key === "string" && meta.wallet_balance_credit_key.trim()) {
      continue
    }

    const onChain =
      String(row.tx_hash ?? "").trim() ||
      (typeof meta.noah_on_chain_tx_hash === "string" ? meta.noah_on_chain_tx_hash.trim() : "")

    if (onChain) {
      attempted += 1
      const { credited: did } = await reconcileNoahBankOnrampCreditForSolanaTx(admin, {
        solanaTxHash: onChain,
        userId: opts.userId,
        businessId: opts.businessId,
      })
      if (did) credited += 1
      continue
    }

    const payload = (row.payload as Record<string, unknown> | undefined) ?? {}
    const enrichment = extractNoahBankPayInEnrichment(payload)
    if (!enrichment?.settledStablecoinAmount || enrichment.settledStablecoinAmount <= 0) continue

    attempted += 1
    const ruleExecutionId =
      (typeof meta.noah_rule_execution_id === "string" && meta.noah_rule_execution_id.trim()) ||
      enrichment.ruleExecutionId ||
      null
    const { credited: did } = await tryCreditNoahBankOnrampPayInWallet(admin, {
      transactionId: String(row.id),
      userId: opts.userId,
      businessId: opts.businessId,
      noahTransactionId: String(row.provider_transaction_id ?? row.id),
      ruleExecutionId,
      payInEnrichment: enrichment,
      metadata: meta,
    })
    if (did) credited += 1
  }

  return { attempted, credited }
}

/**
 * Copy `tx_hash` from settled Noah orchestration Out rows onto the matching pay-in.
 * Run before chain ingest so `findNoahBankOnrampChainSettlementForSuppression` can match signatures.
 */
export async function linkNoahOrchestrationOutHashesForOwner(
  admin: SupabaseClient,
  opts: {
    userId: string
    businessId: string | null
    sinceDays?: number
  },
): Promise<{ linked: number }> {
  const sinceDays = opts.sinceDays ?? 14
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  let q = admin
    .from("transactions")
    .select("tx_hash, metadata, payload")
    .eq("provider", "noah")
    .eq("direction", "out")
    .eq("status", "settled")
    .gte("created_at", sinceIso)
  q = applyLedgerScope(q, opts)

  const { data: rows } = await q.limit(100)
  let linked = 0
  for (const row of rows ?? []) {
    const txHash = pickNoahOnChainTxHashFromLedgerRow(row)
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    const ruleId = String(meta.noah_rule_execution_id ?? "").trim()
    if (!txHash || !ruleId) continue
    await linkBankOnrampPayInToSolanaTxHash(admin, {
      ruleExecutionId: ruleId,
      solanaTxHash: txHash,
      userId: opts.userId,
      businessId: opts.businessId,
    })
    linked += 1
  }
  return { linked }
}
