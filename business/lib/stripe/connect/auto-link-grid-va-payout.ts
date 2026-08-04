import type { SupabaseClient } from "@supabase/supabase-js"
import {
  reconcileGridVaPayoutDestination,
  type ReconcileGridVaResult,
} from "./reconcile-grid-va-payout"

export type AutoLinkGridVaSkipReason =
  | "no_connect_account"
  | "details_not_submitted"
  | "no_grid_va"
  | "missing_va_details"

export type AutoLinkGridVaResult =
  | { skipped: true; reason: AutoLinkGridVaSkipReason }
  | {
      skipped: false
      ok: true
      stripeExternalAccountId: string
      action: "verified" | "updated_default" | "linked"
    }
  | { skipped: false; ok: false; error: string }

function mapSkippedReason(
  reason: Extract<ReconcileGridVaResult, { skipped: true }>["reason"],
): AutoLinkGridVaSkipReason {
  return reason
}

/**
 * Ensure the Grid VA is the default payout destination when eligible.
 * Re-runs reconciliation even when a link already exists in DB.
 */
export async function autoLinkGridVaPayoutIfEligible(
  admin: SupabaseClient,
  input: { businessId: string; currency?: string },
): Promise<AutoLinkGridVaResult> {
  const result = await reconcileGridVaPayoutDestination(admin, input)
  if (result.skipped) {
    return { skipped: true, reason: mapSkippedReason(result.reason) }
  }
  if (!result.ok) {
    return { skipped: false, ok: false, error: result.error }
  }
  return {
    skipped: false,
    ok: true,
    stripeExternalAccountId: result.stripeExternalAccountId,
    action: result.action,
  }
}
