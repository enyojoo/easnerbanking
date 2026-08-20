import type { GlobalPayoutMarginCaptureMode } from "@easner/shared"
import type { SupabaseClient } from "@supabase/supabase-js"

/** @deprecated Legacy env ignored – Noah payouts always use fee_wallet_deferred. */
export function getGlobalPayoutMarginCaptureMode(): GlobalPayoutMarginCaptureMode {
  const raw = String(process.env.GLOBAL_PAYOUT_MARGIN_CAPTURE_MODE || "")
    .trim()
    .toLowerCase()
  if (raw === "split_debit" || raw === "surplus_send") {
    console.warn(
      "[noah_global_payout] GLOBAL_PAYOUT_MARGIN_CAPTURE_MODE is deprecated; using fee_wallet_deferred",
    )
  }
  return "fee_wallet_deferred"
}

export async function assertMarginCaptureModeReady(
  _admin: SupabaseClient,
  _mode: GlobalPayoutMarginCaptureMode,
  _ledgerCurrency: "USD" | "EUR",
): Promise<void> {
  // Revenue is deferred to fee wallet on settle; no platform pool required at execute.
}
