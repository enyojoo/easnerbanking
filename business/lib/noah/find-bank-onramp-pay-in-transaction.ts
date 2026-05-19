import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Find the user-facing pay-in ledger row for a Noah FiatDeposit / RuleExecution id.
 */
export async function findBankOnrampPayInTransaction(
  admin: SupabaseClient,
  opts: {
    depositId: string
    userId: string
    businessId: string | null
  },
): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const depositId = String(opts.depositId || "").trim()
  if (!depositId) return null

  const select = "id, metadata"

  const byRule = admin
    .from("transactions")
    .select(select)
    .eq("provider", "noah")
    .eq("direction", "in")
    .filter("metadata->>noah_rule_execution_id", "eq", depositId)
  if (opts.businessId) {
    byRule.eq("business_id", opts.businessId)
  } else {
    byRule.eq("user_id", opts.userId).is("business_id", null)
  }
  const { data: row1 } = await byRule.maybeSingle()
  if (row1?.id) {
    return {
      id: String(row1.id),
      metadata: (row1.metadata as Record<string, unknown>) ?? {},
    }
  }

  const byDepositMeta = admin
    .from("transactions")
    .select(select)
    .eq("provider", "noah")
    .eq("direction", "in")
    .filter("metadata->>noah_fiat_deposit_id", "eq", depositId)
  if (opts.businessId) {
    byDepositMeta.eq("business_id", opts.businessId)
  } else {
    byDepositMeta.eq("user_id", opts.userId).is("business_id", null)
  }
  const { data: row2 } = await byDepositMeta.maybeSingle()
  if (row2?.id) {
    return {
      id: String(row2.id),
      metadata: (row2.metadata as Record<string, unknown>) ?? {},
    }
  }

  const byPayload = admin
    .from("transactions")
    .select(select)
    .eq("provider", "noah")
    .eq("direction", "in")
    .filter("payload->FiatPayment->>FiatDepositID", "eq", depositId)
  if (opts.businessId) {
    byPayload.eq("business_id", opts.businessId)
  } else {
    byPayload.eq("user_id", opts.userId).is("business_id", null)
  }
  const { data: row3 } = await byPayload.maybeSingle()
  if (row3?.id) {
    return {
      id: String(row3.id),
      metadata: (row3.metadata as Record<string, unknown>) ?? {},
    }
  }

  return null
}
