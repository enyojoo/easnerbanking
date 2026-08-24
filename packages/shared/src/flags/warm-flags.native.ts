import { Image } from "expo-image"
import { getTokenIconUrl } from "../crypto-icons"
import { WARM_PRIORITY_CURRENCIES } from "./warm-priority-assets"

/** Warm expo-image cache for remote token logos (call once on app start). */
export function warmBundledFlagCache(): void {
  for (const currency of WARM_PRIORITY_CURRENCIES) {
    const tokenUrl = getTokenIconUrl(currency)
    if (tokenUrl) {
      void Image.prefetch(tokenUrl, { cachePolicy: "memory-disk" }).catch(() => undefined)
    }
  }
}

/** Warm a single currency flag/token for on-demand screens (accounts, send). */
export function warmNativeCurrencyAssets(currency: string): void {
  const code = String(currency || "").trim().toUpperCase()
  if (!code) return
  const tokenUrl = getTokenIconUrl(code)
  if (tokenUrl) {
    void Image.prefetch(tokenUrl, { cachePolicy: "memory-disk" }).catch(() => undefined)
  }
}
