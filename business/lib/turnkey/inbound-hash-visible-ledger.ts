import type { SupabaseClient } from "@supabase/supabase-js"

/** True when this on-chain inbound already has a user-visible ledger credit (any provider). */
export async function inboundHashHasVisibleLedgerCredit(
  admin: SupabaseClient,
  input: { txHash: string; userId: string; businessId: string | null },
): Promise<boolean> {
  const txHash = String(input.txHash || "").trim()
  if (!txHash) return false

  let q = admin
    .from("transactions")
    .select("id,hidden_from_feed")
    .eq("direction", "in")
    .eq("tx_hash", txHash)
  if (input.businessId) q = q.eq("business_id", input.businessId)
  else q = q.eq("user_id", input.userId).is("business_id", null)

  const { data: rows } = await q.limit(12)
  return (rows ?? []).some((row) => row.hidden_from_feed !== true)
}
