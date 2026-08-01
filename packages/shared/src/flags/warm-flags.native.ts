import { Image } from "expo-image"
import { getTokenIconUrl } from "../crypto-icons"
import { FLAG_ASSETS } from "./flag-assets.manifest"
import { flagIsoForCurrency } from "./flag-source"
import { WARM_PRIORITY_CURRENCIES } from "./warm-priority-assets"

/** Warm expo-image cache for bundled flag PNGs + common token logos (call once on app start). */
export function warmBundledFlagCache(): void {
  for (const source of Object.values(FLAG_ASSETS)) {
    if (source) {
      void Image.prefetch(source, { cachePolicy: "memory-disk" }).catch(() => undefined)
    }
  }

  for (const currency of WARM_PRIORITY_CURRENCIES) {
    const tokenUrl = getTokenIconUrl(currency)
    if (tokenUrl) {
      void Image.prefetch(tokenUrl, { cachePolicy: "memory-disk" }).catch(() => undefined)
    }
    const iso = flagIsoForCurrency(currency)
    if (iso && FLAG_ASSETS[iso]) continue
    // Remote token icons only above; bundled flags already prefetched via FLAG_ASSETS.
  }
}

/** Warm a single currency flag/token for on-demand screens (accounts, send). */
export function warmNativeCurrencyAssets(currency: string): void {
  const code = String(currency || "").trim().toUpperCase()
  if (!code) return
  const iso = flagIsoForCurrency(code)
  if (iso) {
    const bundled = FLAG_ASSETS[iso]
    if (bundled) {
      void Image.prefetch(bundled, { cachePolicy: "memory-disk" }).catch(() => undefined)
    }
  }
  const tokenUrl = getTokenIconUrl(code)
  if (tokenUrl) {
    void Image.prefetch(tokenUrl, { cachePolicy: "memory-disk" }).catch(() => undefined)
  }
}
