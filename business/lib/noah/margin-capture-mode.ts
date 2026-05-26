import type { GlobalPayoutMarginCaptureMode } from "@easner/shared"
import { resolvePooledSolanaSourceAddress } from "@/lib/liquidity/platform-pool"
import type { SupabaseClient } from "@supabase/supabase-js"

const VALID_MODES = new Set<GlobalPayoutMarginCaptureMode>(["surplus_send", "split_debit"])

export function getGlobalPayoutMarginCaptureMode(): GlobalPayoutMarginCaptureMode {
  const raw = String(process.env.GLOBAL_PAYOUT_MARGIN_CAPTURE_MODE || "surplus_send")
    .trim()
    .toLowerCase()
  if (raw === "split_debit") return "split_debit"
  return "surplus_send"
}

export async function assertMarginCaptureModeReady(
  admin: SupabaseClient,
  mode: GlobalPayoutMarginCaptureMode,
  ledgerCurrency: "USD" | "EUR",
): Promise<void> {
  if (mode !== "split_debit") return
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid GLOBAL_PAYOUT_MARGIN_CAPTURE_MODE: ${mode}`)
  }
  const pool = await resolvePooledSolanaSourceAddress(admin, { ledgerCurrency })
  if (!pool) {
    throw new Error(
      `split_debit requires PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_${ledgerCurrency} for margin routing.`,
    )
  }
}
