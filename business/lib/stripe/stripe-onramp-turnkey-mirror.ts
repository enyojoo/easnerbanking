import type { SupabaseClient } from "@supabase/supabase-js"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"

function amountsRoughlyEqual(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false
  return Math.abs(a - b) <= Math.max(0.02, a * 0.001)
}

function applyLedgerScope<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  scope: { userId: string; businessId: string | null },
): T {
  if (scope.businessId) return query.eq("business_id", scope.businessId)
  return query.eq("user_id", scope.userId).is("business_id", null)
}

/** Remove duplicate Turnkey inbound rows once Stripe Express deposit settles on-chain. */
export async function suppressTurnkeyStripeOnrampChainMirrorRow(
  admin: SupabaseClient,
  input: {
    txHash: string
    userId: string
    businessId: string | null
    stripeSessionId?: string | null
  },
): Promise<{ suppressed: number; reversedBalance: number }> {
  const txHash = String(input.txHash ?? "").trim()
  if (!txHash) return { suppressed: 0, reversedBalance: 0 }

  let q = admin
    .from("transactions")
    .select("id,metadata,amount,currency")
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .eq("tx_hash", txHash)
  q = applyLedgerScope(q, input)

  const { data: rows } = await q.limit(8)
  let suppressed = 0
  let reversedBalance = 0

  for (const row of rows ?? []) {
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    const source = String(meta.source ?? "").trim()
    if (
      source !== "turnkey_balance_webhook" &&
      source !== "turnkey_chain_sync" &&
      source !== "turnkey_onchain_backfill"
    ) {
      continue
    }

    const reportingAmount = Number(meta.reporting_wallet_amount ?? row.amount ?? 0)
    if (meta.balance_delta_applied === true && reportingAmount > 0) {
      const currency = String(row.currency ?? "USD").toUpperCase()
      await applyWalletBalanceDelta(admin, {
        businessId: input.businessId,
        userId: input.businessId ? null : input.userId,
        currency,
        delta: -reportingAmount,
      }).catch(() => {})
      reversedBalance += reportingAmount
    }

    await admin.from("transactions").delete().eq("id", row.id)
    suppressed += 1
  }

  return { suppressed, reversedBalance }
}

export async function findPendingStripeOnrampSessionForInbound(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    walletAddress: string
    amount: number
    txHash?: string | null
  },
): Promise<{ stripeSessionId: string } | null> {
  const wallet = String(input.walletAddress || "").trim()
  if (!wallet || !(input.amount > 0)) return null

  let q = admin
    .from("stripe_onramp_sessions")
    .select("stripe_session_id, usd_credit, chain_tx_hash, status")
    .eq("wallet_address", wallet)
    .not("status", "eq", "failed")
  q = applyLedgerScope(q, input)
  const { data: rows } = await q.order("created_at", { ascending: false }).limit(16)

  for (const row of rows ?? []) {
    const status = String(row.status ?? "").toLowerCase()
    if (status === "failed" || status.includes("cancel")) continue
    const credit = Number(row.usd_credit) || 0
    if (!amountsRoughlyEqual(credit, input.amount)) continue
    const existingHash = String(row.chain_tx_hash || "").trim()
    const incomingHash = String(input.txHash || "").trim()
    if (incomingHash && existingHash && existingHash !== incomingHash) continue
    const stripeSessionId = String(row.stripe_session_id || "").trim()
    if (!stripeSessionId) continue
    return { stripeSessionId }
  }

  return null
}

export async function markStripeOnrampSessionChainTxHash(
  admin: SupabaseClient,
  input: { stripeSessionId: string; txHash: string },
): Promise<void> {
  const stripeSessionId = String(input.stripeSessionId || "").trim()
  const txHash = String(input.txHash || "").trim()
  if (!stripeSessionId || !txHash) return
  await admin
    .from("stripe_onramp_sessions")
    .update({ chain_tx_hash: txHash, updated_at: new Date().toISOString() })
    .eq("stripe_session_id", stripeSessionId)
    .is("chain_tx_hash", null)
}
