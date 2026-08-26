/**
 * Hide duplicate Turnkey webhook rows that mirror Grid VA bank deposits.
 *
 * Usage:
 *   cd business
 *   node --env-file=.env.local --import ./scripts/stub-server-only.mjs --import tsx scripts/heal-grid-va-turnkey-mirror-rows.ts
 *   BUSINESS_ID=53798479-3d39-428a-bd22-0b48fc3792a2 node ...  # optional scope
 */
import { createClient } from "@supabase/supabase-js"
import { isGridVaTurnkeyDustAmount } from "@/lib/grid/grid-va-turnkey-dust"
import { suppressTurnkeyGridVaChainMirrorRow } from "@/lib/grid/grid-va-turnkey-mirror"

function amountsRoughlyEqual(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false
  return Math.abs(a - b) <= Math.max(0.02, a * 0.001)
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase env missing")
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const businessId = process.env.BUSINESS_ID?.trim() || null
  const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const dustCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  let mirrorQuery = admin
    .from("transactions")
    .select("id,tx_hash,user_id,business_id,metadata,amount,currency")
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .contains("metadata", { source: "turnkey_balance_webhook" })
    .eq("hidden_from_feed", false)
  if (businessId) mirrorQuery = mirrorQuery.eq("business_id", businessId)

  const { data: mirrorRows } = await mirrorQuery.order("created_at", { ascending: true })
  const linked: Record<string, unknown>[] = []

  for (const sample of mirrorRows ?? []) {
    const txHash = String(sample.tx_hash ?? "").trim()
    if (!txHash) continue
    const amount = Number(
      (sample.metadata as Record<string, unknown> | undefined)?.reporting_wallet_amount ??
        sample.amount ??
        0,
    )
    const userId = String(sample.user_id ?? "")
    const bizId = sample.business_id ? String(sample.business_id) : null
    const currency = String(sample.currency ?? "USD").toUpperCase()

    let matched = false
    let matchedDepositId: string | undefined

    if (isGridVaTurnkeyDustAmount(amount) && bizId) {
      const { data: recentSweep } = await admin
        .from("grid_transfers")
        .select("id")
        .eq("mode", "va_turnkey_sweep")
        .eq("business_id", bizId)
        .in("status", ["settled", "processing", "pending"])
        .gte("updated_at", dustCutoff)
        .limit(1)
        .maybeSingle()
      matched = Boolean(recentSweep?.id)
    } else if (amount > 0) {
      let q = admin
        .from("transactions")
        .select("id,amount,metadata,currency")
        .eq("provider", "grid")
        .eq("direction", "in")
        .eq("status", "settled")
        .filter("metadata->>grid_va_inbound", "eq", "true")
        .gte("created_at", sinceIso)
      q = bizId ? q.eq("business_id", bizId) : q.eq("user_id", userId).is("business_id", null)
      const { data: deposits } = await q.order("created_at", { ascending: false }).limit(24)
      const hit = (deposits ?? []).find((row) => {
        const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
        const ledger = String(meta.wallet_ledger_currency ?? row.currency ?? "USD").toUpperCase()
        if (ledger !== currency) return false
        const depositAmount = Number(meta.settled_stablecoin_amount ?? row.amount ?? 0)
        return amountsRoughlyEqual(depositAmount, amount)
      })
      matched = Boolean(hit)
      matchedDepositId = hit ? String(hit.id) : undefined
    }

    if (!matched) {
      linked.push({ txHash, amount, linked: false, reason: "no_grid_va_match" })
      continue
    }

    const suppressed = await suppressTurnkeyGridVaChainMirrorRow(admin, {
      txHash,
      userId,
      businessId: bizId,
    })
    linked.push({ txHash, amount, matchedDepositId, ...suppressed })
  }

  console.log(JSON.stringify({ linked }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
