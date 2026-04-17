import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Phase 2: multi-approver / policy-before-sign for business spend.
 * Phase 1: no blocking — hook stays centralized for later policy tags + thresholds.
 */
export async function assertBusinessTransferAllowed(
  _admin: SupabaseClient,
  _businessId: string,
  _amountSourceCurrency: number,
  _sourceCurrency: string,
): Promise<void> {
  void _admin
  void _businessId
  void _amountSourceCurrency
  void _sourceCurrency
}
