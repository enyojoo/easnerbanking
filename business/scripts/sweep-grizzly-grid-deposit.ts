/**
 * Sweep a single Grizzly Grid VA deposit to Turnkey (default: $1).
 *
 * Usage:
 *   cd business
 *   node --env-file=.env.local --import ./scripts/stub-server-only.mjs --import tsx scripts/sweep-grizzly-grid-deposit.ts
 *   SWEEP_TRANSFER_ID=be2a1500-bc27-4f74-b5fc-1f3e8be65539 node ...  # $4500
 */
import { createClient } from "@supabase/supabase-js"
import { executeGridVaTurnkeySweep } from "@/lib/grid/va-turnkey-sweep"
import { retrieveGridQuote } from "@/lib/grid/quote-funding"

const TRANSFER_ID = process.env.SWEEP_TRANSFER_ID?.trim() || "b3db1eb6-b632-4717-aa8a-45bcd92425e7"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase env missing")
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: before } = await admin.from("grid_transfers").select("*").eq("id", TRANSFER_ID).maybeSingle()
  console.log(JSON.stringify({ step: "before", transfer: before }, null, 2))

  const result = await executeGridVaTurnkeySweep(admin, TRANSFER_ID)
  console.log(JSON.stringify({ step: "sweep", result }, null, 2))

  const { data: after } = await admin.from("grid_transfers").select("*").eq("id", TRANSFER_ID).maybeSingle()
  console.log(JSON.stringify({ step: "after", transfer: after }, null, 2))

  if (after?.grid_quote_id) {
    const quote = await retrieveGridQuote(String(after.grid_quote_id)).catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    }))
    console.log(JSON.stringify({ step: "quote", quote }, null, 2))
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
