import type { SupabaseClient } from "@supabase/supabase-js"
import { getBusinessRoleForUser } from "@/lib/b2b/require-role"

const OWNER_ONLY_THRESHOLD_USD = 10_000

/**
 * Phase 2: multi-approver / policy-before-sign for business spend.
 * Payroll runs above threshold require Owner role at approve/execute time.
 */
export async function assertBusinessTransferAllowed(
  admin: SupabaseClient,
  businessId: string,
  amountSourceCurrency: number,
  sourceCurrency: string,
  userId: string,
): Promise<void> {
  if (sourceCurrency.toUpperCase() !== "USD" && sourceCurrency.toUpperCase() !== "EUR") return
  if (amountSourceCurrency < OWNER_ONLY_THRESHOLD_USD) return

  const role = await getBusinessRoleForUser(admin, userId, businessId)
  if (role !== "Owner") {
    throw new Error(`Payments of ${amountSourceCurrency} ${sourceCurrency} or more require Owner approval.`)
  }
}
