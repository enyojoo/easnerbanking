import type { SupabaseClient } from "@supabase/supabase-js"

/** Settled inbound Turnkey row already in ledger for this scope + Solana signature. */
export async function turnkeyInboundLedgerRowExists(
  admin: SupabaseClient,
  opts: {
    signature: string
    userId: string
    businessId: string | null
  },
): Promise<boolean> {
  const sig = String(opts.signature || "").trim()
  if (!sig) return false

  let q = admin
    .from("transactions")
    .select("id")
    .eq("provider", "turnkey")
    .eq("tx_hash", sig)
    .eq("direction", "in")
    .eq("status", "settled")
  if (opts.businessId) {
    q = q.eq("business_id", opts.businessId)
  } else {
    q = q.eq("user_id", opts.userId).is("business_id", null)
  }
  const { data } = await q.maybeSingle()
  return Boolean(data?.id)
}
