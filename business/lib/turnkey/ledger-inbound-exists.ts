import type { SupabaseClient } from "@supabase/supabase-js"

type TurnkeyInboundScope = {
  signature: string
  userId: string
  businessId: string | null
}

function scopedTurnkeyInboundQuery(
  admin: SupabaseClient,
  opts: TurnkeyInboundScope,
) {
  const sig = String(opts.signature || "").trim()
  let q = admin
    .from("transactions")
    .select("id,hidden_from_feed")
    .eq("provider", "turnkey")
    .eq("tx_hash", sig)
    .eq("direction", "in")
    .eq("status", "settled")
  if (opts.businessId) {
    q = q.eq("business_id", opts.businessId)
  } else {
    q = q.eq("user_id", opts.userId).is("business_id", null)
  }
  return q
}

/** Any settled inbound Turnkey row for this scope + Solana signature (including feed-hidden mirrors). */
export async function turnkeyInboundLedgerRowExists(
  admin: SupabaseClient,
  opts: TurnkeyInboundScope,
): Promise<boolean> {
  const sig = String(opts.signature || "").trim()
  if (!sig) return false
  const { data } = await scopedTurnkeyInboundQuery(admin, opts).maybeSingle()
  return Boolean(data?.id)
}

/** User-visible settled inbound Turnkey row for this scope + Solana signature. */
export async function turnkeyVisibleInboundLedgerRowExists(
  admin: SupabaseClient,
  opts: TurnkeyInboundScope,
): Promise<boolean> {
  const sig = String(opts.signature || "").trim()
  if (!sig) return false
  const { data: rows } = await scopedTurnkeyInboundQuery(admin, opts).limit(4)
  return (rows ?? []).some((row) => row.hidden_from_feed !== true)
}
