import type { SupabaseClient } from "@supabase/supabase-js"

/** Ledger transaction id for a Stripe-paid invoice (from settlement table). */
export async function resolveStripeSettlementLedgerTransactionId(
  admin: SupabaseClient,
  invoiceId: string,
  businessId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("invoice_stripe_settlements")
    .select("ledger_transaction_id")
    .eq("invoice_id", invoiceId)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[invoice] stripe settlement ledger lookup:", error.message)
    return null
  }

  const id = data?.ledger_transaction_id
  return typeof id === "string" && id.trim() ? id.trim() : null
}
