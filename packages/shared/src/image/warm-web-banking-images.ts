import { warmAllWebFlagAssets, warmWebFlagCache } from "../flags/warm-flags.web"
import { warmWebPayoutIcons } from "../payout-icons/warm-payout-icons.web"

/**
 * Session image warmup for web banking UIs.
 * Priority flags/tokens/networks immediately; full flag set and (optional)
 * bank/MoMo icons at idle so pickers paint complete.
 */
export function warmWebBankingImages(opts?: { payoutIcons?: boolean }): void {
  warmWebFlagCache()
  warmAllWebFlagAssets()
  if (opts?.payoutIcons ?? true) warmWebPayoutIcons()
}
