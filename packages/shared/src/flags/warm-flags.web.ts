import { getNetworkIconUrl, getTokenIconUrl } from "../crypto-icons"
import { warmImageUrl, warmImageUrls, warmImageUrlsAtIdle } from "../image/image-warm-cache.web"
import { FLAG_ISO_CODES } from "./flag-iso-codes"
import { flagIsoForCurrency, getFlagPublicUrl } from "./flag-source"
import { WARM_PRIORITY_CURRENCIES, WARM_PRIORITY_ISOS, WARM_PRIORITY_NETWORKS } from "./warm-priority-assets"

/** Prefetch priority flags, token logos, and chain logos once per session. */
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

  for (const network of WARM_PRIORITY_NETWORKS) {
    const networkUrl = getNetworkIconUrl(network)
    if (networkUrl) urls.add(networkUrl)
  }

  warmImageUrls(urls)
}

/**
 * Warm every flag at idle so country pickers (send, KYB, payroll, office
 * corridors) paint complete. Priority set covers ~25 of 204; the rest would
 * pop in on first open. ~1.8 MB of immutable PNGs, once per browser.
 */
export function warmAllWebFlagAssets(): void {
  warmImageUrlsAtIdle(FLAG_ISO_CODES.map((iso) => getFlagPublicUrl(iso)))
}

/** Warm a single currency flag (e.g. when an account row mounts). */
export function warmWebCurrencyFlag(currency: string): void {
  const iso = flagIsoForCurrency(currency)
  const url = iso ? getFlagPublicUrl(iso) : undefined
  if (url) warmImageUrl(url)
  const tokenUrl = getTokenIconUrl(currency)
  if (tokenUrl) warmImageUrl(tokenUrl)
}
