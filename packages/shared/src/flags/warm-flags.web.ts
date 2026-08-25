import { getTokenIconUrl } from "../crypto-icons"
import { isImageWarm, warmImageUrl, warmImageUrls } from "../image/image-warm-cache.web"
import { FLAG_ISO_CODES } from "./flag-iso-codes"
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

/**
 * Warm EVERY flag asset at idle, in small chunks.
 *
 * The priority list above covers ~25 of 204 flags — every other country's
 * flag was cold forever, so full-country pickers (recipient form, signup,
 * KYB, payroll) filled in raggedly on first open. The whole set is ~1.8 MB
 * of immutable PNGs; warming it in the background once per browser makes
 * every picker paint complete on arrival. Chunked so the main thread and
 * network stay clear for real work.
 */
export function warmAllWebFlagAssets(): void {
  if (typeof window === "undefined") return
  const pending = FLAG_ISO_CODES
    .map((iso) => getFlagPublicUrl(iso))
    .filter((url): url is string => Boolean(url) && !isImageWarm(url))
  if (pending.length === 0) return

  const CHUNK_SIZE = 12
  let index = 0
  const w = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  }
  const scheduleNext = () => {
    if (index >= pending.length) return
    const run = () => {
      warmImageUrls(pending.slice(index, index + CHUNK_SIZE))
      index += CHUNK_SIZE
      scheduleNext()
    }
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(run, { timeout: 5_000 })
    } else {
      setTimeout(run, 250)
    }
  }
  scheduleNext()
}

/** Warm a single currency flag (e.g. when an account row mounts). */
export function warmWebCurrencyFlag(currency: string): void {
  const iso = flagIsoForCurrency(currency)
  const url = iso ? getFlagPublicUrl(iso) : undefined
  if (url) warmImageUrl(url)
  const tokenUrl = getTokenIconUrl(currency)
  if (tokenUrl) warmImageUrl(tokenUrl)
}
