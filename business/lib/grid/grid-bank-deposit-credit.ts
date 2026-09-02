import type { SupabaseClient } from "@supabase/supabase-js"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { turnkeyInboundAppliedBalanceDelta } from "@/lib/noah/credit-bank-onramp-wallet"
import { notifyGridBankDepositPayInSettledPush } from "@/lib/notifications/bank-deposit-settled-notify"
import { mergeBankDepositLifecycleMetadata } from "@/lib/noah/bank-onramp-tx"
import { suppressTurnkeyGridVaChainMirrorRow } from "./grid-va-turnkey-mirror"
import { ledgerAmountToUsd, maybeApplyVelocityControl } from "@/lib/wallet-send-compliance"

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

async function attachGridVaOnChainHash(
  admin: SupabaseClient,
  input: {
    transactionId: string
    priorMeta: Record<string, unknown>
    solanaTxHash: string
    onChainSettledAt?: string | null
  },
): Promise<void> {
  const hash = String(input.solanaTxHash || "").trim()
  if (!hash) return
  const already = String(input.priorMeta.grid_on_chain_tx_hash ?? input.priorMeta.tx_hash ?? "").trim()
  if (already === hash && input.priorMeta.on_chain_settled_at) return

  const settledAt = input.onChainSettledAt?.trim() || new Date().toISOString()
  const merged = mergeBankDepositLifecycleMetadata(input.priorMeta, {
    on_chain_settled_at: settledAt,
  })
  await admin
    .from("transactions")
    .update({
      tx_hash: hash,
      metadata: {
        ...merged,
        grid_on_chain_tx_hash: hash,
        grid_turnkey_sweep_status: "settled",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.transactionId)
  await notifyGridBankDepositPayInSettledPush(admin, input.transactionId).catch(() => undefined)
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

  const solanaTxHash = String(input.solanaTxHash ?? "").trim()
  if (solanaTxHash) {
    await suppressTurnkeyGridVaChainMirrorRow(admin, {
      txHash: solanaTxHash,
      userId: input.userId,
      businessId: input.businessId,
    }).catch(() => ({ suppressed: 0, reversedBalance: 0 }))
  }

  const creditKey = buildGridVaBankDepositCreditKey(input.gridTransactionId)
  const { data: priorCredit } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", input.transactionId)
    .maybeSingle()
  const priorMeta = (priorCredit?.metadata as Record<string, unknown> | undefined) ?? {}
  if (priorMeta.wallet_balance_credit_key === creditKey) {
    if (input.solanaTxHash) {
      await attachGridVaOnChainHash(admin, {
        transactionId: input.transactionId,
        priorMeta,
        solanaTxHash: input.solanaTxHash,
        onChainSettledAt: input.onChainSettledAt,
      })
    }
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

  await maybeApplyVelocityControl(admin, {
    businessId: input.businessId,
    amountUsd: ledgerAmountToUsd(input.creditAmount, input.ledgerCurrency),
    source: "grid_va",
    transactionId: input.transactionId,
    creditKey,
  })

  const chainSettledAt = input.solanaTxHash
    ? input.onChainSettledAt?.trim() || new Date().toISOString()
    : null
  const merged = mergeBankDepositLifecycleMetadata(priorMeta, {
    fiat_settled_at: input.onChainSettledAt?.trim() || new Date().toISOString(),
    ...(chainSettledAt ? { on_chain_settled_at: chainSettledAt } : {}),
  })

  await admin
    .from("transactions")
    .update({
      metadata: {
        ...merged,
        wallet_balance_credit_key: creditKey,
        settled_stablecoin_amount: input.creditAmount,
        wallet_ledger_currency: input.ledgerCurrency,
        grid_turnkey_sweep_status: input.solanaTxHash ? "settled" : "pending",
        ...(input.solanaTxHash ? { grid_on_chain_tx_hash: input.solanaTxHash } : {}),
      },
      ...(input.solanaTxHash ? { tx_hash: input.solanaTxHash } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.transactionId)

  if (chainSettledAt) {
    await notifyGridBankDepositPayInSettledPush(admin, input.transactionId).catch(() => undefined)
  }

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
