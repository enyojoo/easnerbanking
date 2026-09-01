/**
 * Delete Grid VA → Turnkey duplicate / dust rows for every business (not one account).
 * Reverses leftover balance_delta_applied, then DELETEs the row.
 *
 *   cd business && npx tsx scripts/cleanup-grid-turnkey-mirrors.ts
 *   cd business && npx tsx scripts/cleanup-grid-turnkey-mirrors.ts --apply
 */
import { createClient } from "@supabase/supabase-js"
import {
  gridVaSweepTreasuryAddresses,
  isGridVaSweepTreasurySender,
} from "@/lib/grid/grid-va-sweep-treasury"
import { isGridVaTurnkeyDustAmount } from "@/lib/grid/grid-va-turnkey-dust"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"

const APPLY = process.argv.includes("--apply")
const BUSINESS_FILTER = process.argv.find((a) => a.startsWith("--business="))?.slice("--business=".length)

function senderOf(row: {
  counterparty_address?: string | null
  metadata?: unknown
}): string {
  const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
  return (
    String(row.counterparty_address ?? "").trim() ||
    (typeof meta.from_address === "string" ? meta.from_address.trim() : "")
  )
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const treasuries = gridVaSweepTreasuryAddresses()
  const seen = new Set<string>()
  const candidates: Array<Record<string, unknown>> = []

  const pull = async (q: ReturnType<ReturnType<typeof admin.from>["select"]>) => {
    let scoped = q
    if (BUSINESS_FILTER) scoped = scoped.eq("business_id", BUSINESS_FILTER)
    const { data, error } = await scoped.order("created_at", { ascending: false }).limit(500)
    if (error) throw error
    for (const row of data ?? []) {
      const id = String(row.id)
      if (seen.has(id)) continue
      seen.add(id)
      candidates.push(row as Record<string, unknown>)
    }
  }

  const base = () =>
    admin
      .from("transactions")
      .select(
        "id,user_id,business_id,amount,currency,tx_hash,metadata,hidden_from_feed,counterparty_address",
      )
      .eq("provider", "turnkey")
      .eq("direction", "in")

  await pull(base().in("counterparty_address", treasuries))
  await pull(base().contains("metadata", { grid_va_turnkey_chain_mirror: true }))
  await pull(base().contains("metadata", { ensure_visible_deposit: true }))

  let deleted = 0
  let reversed = 0

  for (const row of candidates) {
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    const from = senderOf(row)
    const amount = Number(row.amount ?? 0)
    const isDust =
      isGridVaTurnkeyDustAmount(amount) ||
      (meta.ensure_visible_deposit === true && amount < 0.01)
    const isMirror =
      meta.grid_va_turnkey_chain_mirror === true || isGridVaSweepTreasurySender(from)
    if (!isDust && !isMirror) continue

    console.log(isDust ? "DELETE_DUST" : "DELETE_MIRROR", {
      id: row.id,
      businessId: row.business_id,
      amount,
      hidden: row.hidden_from_feed,
      txHash: row.tx_hash,
      from,
    })

    if (!APPLY) {
      deleted += 1
      continue
    }

    const reportingAmount = Number(meta.reporting_wallet_amount ?? amount)
    if (meta.balance_delta_applied === true && reportingAmount > 0) {
      await applyWalletBalanceDelta(admin, {
        businessId: row.business_id ? String(row.business_id) : null,
        userId: row.business_id ? null : String(row.user_id),
        currency: String(row.currency ?? "USD"),
        delta: -reportingAmount,
      })
      reversed += reportingAmount
    }

    const { error } = await admin.from("transactions").delete().eq("id", String(row.id))
    if (error) throw error
    deleted += 1
  }

  console.log({ APPLY, scope: BUSINESS_FILTER || "all_businesses", deleted, reversed, scanned: candidates.length })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
