import type { SupabaseClient } from "@supabase/supabase-js"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { turnkeyInboundAppliedBalanceDelta } from "@/lib/noah/credit-bank-onramp-wallet"
import { notifyGridBankDepositPayInSettledPush } from "@/lib/notifications/bank-deposit-settled-notify"
import { mergeBankDepositLifecycleMetadata } from "@/lib/noah/bank-onramp-tx"

function applyLedgerScope<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  scope: { userId: string; businessId: string | null },
): T {
  if (scope.businessId) return query.eq("business_id", scope.businessId)
  return query.eq("user_id", scope.userId).is("business_id", null)
}

export function buildGridVaBankDepositCreditKey(gridTransactionId: string): string {
  return `grid_va_inbound:${String(gridTransactionId || "").trim()}`
}

export function isGridVaBankDepositMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const meta = metadata as Record<string, unknown>
  return meta.flow === "bank_onramp" && meta.payout_provider === "grid" && meta.grid_va_inbound === true
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

export async function tryCreditGridVaBankDepositWallet(
  admin: SupabaseClient,
  input: {
    transactionId: string
    userId: string
    businessId: string | null
    gridTransactionId: string
    creditAmount: number
    ledgerCurrency: "USD" | "EUR"
    solanaTxHash?: string | null
    onChainSettledAt?: string | null
  },
): Promise<{ credited: boolean; skippedReason?: string }> {
  if (!(input.creditAmount > 0)) {
    return { credited: false, skippedReason: "no_settled_amount" }
  }

  const creditKey = buildGridVaBankDepositCreditKey(input.gridTransactionId)
  const { data: priorCredit } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", input.transactionId)
    .maybeSingle()
  const priorMeta = (priorCredit?.metadata as Record<string, unknown> | undefined) ?? {}
  if (priorMeta.wallet_balance_credit_key === creditKey) {
    return { credited: false, skippedReason: "already_credited" }
  }

  const hashCandidates = [
    input.solanaTxHash,
    typeof priorMeta.grid_on_chain_tx_hash === "string" ? priorMeta.grid_on_chain_tx_hash : null,
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
        metadata: {
          ...priorMeta,
          wallet_balance_credit_key: creditKey,
          grid_turnkey_mirror_suppressed: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.transactionId)
    return { credited: false, skippedReason: "turnkey_already_credited" }
  }

  await applyWalletBalanceDelta(admin, {
    businessId: input.businessId,
    userId: input.businessId ? null : input.userId,
    currency: input.ledgerCurrency,
    delta: input.creditAmount,
  })

  const onChainSettledAt = input.onChainSettledAt?.trim() || new Date().toISOString()
  const merged = mergeBankDepositLifecycleMetadata(priorMeta, {
    on_chain_settled_at: onChainSettledAt,
    grid_on_chain_tx_hash: input.solanaTxHash ?? undefined,
  })

  await admin
    .from("transactions")
    .update({
      metadata: {
        ...merged,
        wallet_balance_credit_key: creditKey,
        settled_stablecoin_amount: input.creditAmount,
        wallet_ledger_currency: input.ledgerCurrency,
      },
      ...(input.solanaTxHash ? { tx_hash: input.solanaTxHash } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.transactionId)

  await notifyGridBankDepositPayInSettledPush(admin, input.transactionId).catch(() => undefined)

  return { credited: true }
}

export async function reconcileGridVaBankDepositCreditForSolanaTx(
  admin: SupabaseClient,
  opts: {
    solanaTxHash: string
    userId: string
    businessId: string | null
    inboundAmount?: number | null
    ledgerCurrency?: "USD" | "EUR"
  },
): Promise<{ credited: boolean }> {
  const solanaTxHash = String(opts.solanaTxHash || "").trim()
  if (!solanaTxHash) return { credited: false }

  const select =
    "id,status,metadata,payload,provider_transaction_id,amount,currency,user_id,business_id"

  let byHash = admin
    .from("transactions")
    .select(select)
    .eq("provider", "grid")
    .eq("direction", "in")
    .eq("status", "settled")
    .eq("tx_hash", solanaTxHash)
  byHash = applyLedgerScope(byHash, opts)
  let { data: payInRow } = await byHash.maybeSingle()

  if (!payInRow?.id) {
    let byMeta = admin
      .from("transactions")
      .select(select)
      .eq("provider", "grid")
      .eq("direction", "in")
      .eq("status", "settled")
      .filter("metadata->>grid_on_chain_tx_hash", "eq", solanaTxHash)
    byMeta = applyLedgerScope(byMeta, opts)
    const res = await byMeta.maybeSingle()
    payInRow = res.data
  }

  if (!payInRow?.id && opts.inboundAmount != null && opts.inboundAmount > 0) {
    let byAmount = admin
      .from("transactions")
      .select(select)
      .eq("provider", "grid")
      .eq("direction", "in")
      .eq("status", "settled")
      .is("tx_hash", null)
      .filter("metadata->>flow", "eq", "bank_onramp")
      .filter("metadata->>grid_va_inbound", "eq", "true")
    byAmount = applyLedgerScope(byAmount, opts)
    const { data: rows } = await byAmount.order("created_at", { ascending: false }).limit(12)
    const currency = opts.ledgerCurrency ?? "USD"
    payInRow =
      (rows ?? []).find((row) => {
        const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
        if (meta.wallet_balance_credit_key) return false
        const amount = Number(row.amount ?? 0)
        const ledger = String(meta.wallet_ledger_currency ?? row.currency ?? "USD").toUpperCase()
        return ledger === currency && Math.abs(amount - opts.inboundAmount!) < 0.02
      }) ?? null
  }

  if (!payInRow?.id) return { credited: false }

  const meta = (payInRow.metadata as Record<string, unknown> | undefined) ?? {}
  const gridTransactionId = String(
    meta.grid_transaction_id ?? payInRow.provider_transaction_id ?? payInRow.id,
  ).trim()
  const creditAmount = Number(meta.settled_stablecoin_amount ?? payInRow.amount ?? 0)
  const ledgerCurrency = String(meta.wallet_ledger_currency ?? payInRow.currency ?? "USD").toUpperCase() ===
    "EUR"
    ? "EUR"
    : "USD"

  const result = await tryCreditGridVaBankDepositWallet(admin, {
    transactionId: String(payInRow.id),
    userId: opts.userId,
    businessId: opts.businessId,
    gridTransactionId,
    creditAmount,
    ledgerCurrency,
    solanaTxHash,
    onChainSettledAt: new Date().toISOString(),
  })

  return { credited: result.credited }
}
