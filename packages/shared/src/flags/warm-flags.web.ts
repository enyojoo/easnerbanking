import { getTokenIconUrl } from "../crypto-icons"
import { warmImageUrl, warmImageUrls } from "../image/image-warm-cache.web"
import { flagIsoForCurrency, getFlagPublicUrl } from "./flag-source"
import { WARM_PRIORITY_CURRENCIES, WARM_PRIORITY_ISOS } from "./warm-priority-assets"

/** Prefetch flag PNGs and token logos once per session (best-effort). */
export function warmWebFlagCache(): void {
  const urls = new Set<string>()

  for (const iso of WARM_PRIORITY_ISOS) {
    const url = getFlagPublicUrl(iso)
    if (url) urls.add(url)
  }

  for (const currency of WARM_PRIORITY_CURRENCIES) {
    const iso = flagIsoForCurrency(currency)
    const flagUrl = iso ? getFlagPublicUrl(iso) : undefined
    if (flagUrl) urls.add(flagUrl)
    const tokenUrl = getTokenIconUrl(currency)
    if (tokenUrl) urls.add(tokenUrl)
  }

  warmImageUrls(urls)
}

/** Warm a single currency flag (e.g. when an account row mounts). */
export function warmWebCurrencyFlag(currency: string): void {
  const iso = flagIsoForCurrency(currency)
  const url = iso ? getFlagPublicUrl(iso) : undefined
  if (url) warmImageUrl(url)
  const tokenUrl = getTokenIconUrl(currency)
  if (tokenUrl) warmImageUrl(tokenUrl)
}
