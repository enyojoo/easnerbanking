/**
 * Re-export for Metro – web uses warm-flags.web via babel alias.
 */
import { warmWebFlagCache, warmWebCurrencyFlag } from '../../../packages/shared/src/flags/warm-flags.web'
import { warmWebPayoutIcons } from '../../../packages/shared/src/payout-icons/warm-payout-icons.web'

export function warmBundledFlagCache(): void {
  warmWebFlagCache()
  warmWebPayoutIcons()
}

export { warmWebCurrencyFlag as warmNativeCurrencyAssets }
