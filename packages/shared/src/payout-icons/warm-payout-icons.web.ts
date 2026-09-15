import { getBankLogoPublicUrl, listBankLogoPublicUrls } from "../bank-icons"
import { warmImageUrls, warmImageUrlsAtIdle } from "../image/image-warm-cache.web"
import { getMobileMoneyProviderPublicUrl, listMobileMoneyIconPublicUrls } from "../mobile-money-icons"

/** Warm every bundled bank + MoMo PNG at idle so pickers do not pop in empty. */
export function warmWebPayoutIcons(): void {
  warmImageUrlsAtIdle([...listBankLogoPublicUrls(), ...listMobileMoneyIconPublicUrls()])
}

/** Warm the logos for the open corridor immediately (selected list, not the full set). */
export function warmWebPayoutIconLabels(opts: { banks?: string[]; providers?: string[] }): void {
  const urls: string[] = []
  for (const bank of opts.banks ?? []) {
    const url = getBankLogoPublicUrl(bank)
    if (url) urls.push(url)
  }
  for (const provider of opts.providers ?? []) {
    const url = getMobileMoneyProviderPublicUrl(provider)
    if (url) urls.push(url)
  }
  warmImageUrls(urls)
}
