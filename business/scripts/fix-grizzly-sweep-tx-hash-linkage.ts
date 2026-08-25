/**
 * Fix swapped on-chain hash linkage for Grizzly Grid VA sweeps.
 */
import { createClient } from "@supabase/supabase-js"

const BUSINESS_ID = "53798479-3d39-428a-bd22-0b48fc3792a2"
const FIXES = [
  {
    sweepId: "b3db1eb6-b632-4717-aa8a-45bcd92425e7",
    ledgerId: "8a11ed22-2f39-441c-a262-c9e1730baeca",
    txHash: "3bZnChsHBXX3g2RREzJvT9cS7yDE5N7gXAWk23rSLBQaqTLhD5qBpxaHiWhH6PN1wzi5kfaww3KLSvXG6FoqDTtp",
    amount: 1,
  },
  {
    sweepId: "be2a1500-bc27-4f74-b5fc-1f3e8be65539",
    ledgerId: "a9355658-7518-4204-916f-6e0f7d9050ba",
    txHash: "5tGazsFACAKg4gcNVfygDhbbpneFouwPzEqA3DTzuhFFNLEGn97GeZipyq33nSz44wUhUZmBu8C4Qzd3Kf6NFgZn",
    amount: 4500,
  },
] as const

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const now = new Date().toISOString()

  for (const fix of FIXES) {
    const { data: ledger } = await admin.from("transactions").select("metadata").eq("id", fix.ledgerId).maybeSingle()
    const meta = (ledger?.metadata as Record<string, unknown> | undefined) ?? {}
    await admin
      .from("transactions")
      .update({
        tx_hash: fix.txHash,
        metadata: {
          ...meta,
          grid_on_chain_tx_hash: fix.txHash,
          grid_turnkey_sweep_status: "settled",
        },
        updated_at: now,
      })
      .eq("id", fix.ledgerId)

    const { data: sweep } = await admin.from("grid_transfers").select("metadata").eq("id", fix.sweepId).maybeSingle()
    const sweepMeta = (sweep?.metadata as Record<string, unknown> | undefined) ?? {}
    await admin
      .from("grid_transfers")
      .update({
        metadata: {
          ...sweepMeta,
          grid_on_chain_tx_hash: fix.txHash,
          sweep_error: null,
        },
        updated_at: now,
      })
      .eq("id", fix.sweepId)

    console.log(JSON.stringify({ ledgerId: fix.ledgerId, amount: fix.amount, txHash: fix.txHash.slice(0, 12) }))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
