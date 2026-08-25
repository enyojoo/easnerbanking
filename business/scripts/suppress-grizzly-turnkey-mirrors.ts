import { createClient } from "@supabase/supabase-js"
import { suppressTurnkeyGridVaChainMirrorRow } from "@/lib/grid/va-turnkey-sweep"

const BUSINESS_ID = "53798479-3d39-428a-bd22-0b48fc3792a2"
const USER_ID = "eb0315b0-479c-4d7d-b312-88dd3cb49fc2"
const HASHES = [
  "3bZnChsHBXX3g2RREzJvT9cS7yDE5N7gXAWk23rSLBQaqTLhD5qBpxaHiWhH6PN1wzi5kfaww3KLSvXG6FoqDTtp",
  "5tGazsFACAKg4gcNVfygDhbbpneFouwPzEqA3DTzuhFFNLEGn97GeZipyq33nSz44wUhUZmBu8C4Qzd3Kf6NFgZn",
] as const

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  for (const txHash of HASHES) {
    const result = await suppressTurnkeyGridVaChainMirrorRow(admin, {
      txHash,
      userId: USER_ID,
      businessId: BUSINESS_ID,
    })
    console.log(JSON.stringify({ txHash: txHash.slice(0, 12), ...result }))
  }
  const { data } = await admin
    .from("transactions")
    .select("id,amount,hidden_from_feed,metadata")
    .in("id", ["dad56f9e-6f0c-4d76-ac62-50762d895158", "cf939cac-9c45-4ab3-95ab-7888c288cc0b"])
  console.log(JSON.stringify({ mirrorRows: data }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
