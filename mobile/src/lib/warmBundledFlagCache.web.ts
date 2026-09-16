/**
 * Re-export for Metro – web uses shared warmers via babel alias.
 */
import { warmWebCurrencyFlag } from '../../../packages/shared/src/flags/warm-flags.web'
import { warmWebBankingImages } from '../../../packages/shared/src/image/warm-web-banking-images'

export function warmBundledFlagCache(): void {
  warmWebBankingImages()
}

export { warmWebCurrencyFlag as warmNativeCurrencyAssets }
