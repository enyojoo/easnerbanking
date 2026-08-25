import { Image } from "expo-image"
import { getNetworkIconUrl, getTokenIconUrl } from "../crypto-icons"
import { WARM_PRIORITY_CURRENCIES, WARM_PRIORITY_NETWORKS } from "./warm-priority-assets"

function prefetchRemote(url: string | undefined): void {
  if (!url) return
  void Image.prefetch(url, { cachePolicy: "memory-disk" }).catch(() => undefined)
}

/**
 * Warm expo-image cache for remote token + network logos (call once on app
 * start). Flags themselves are bundled `require()` assets on native — always
 * instant, nothing to warm. Before the network list was added, boot warming
 * covered exactly 2 URLs (USDC + USDT) while the wallet-send corridor picker
 * rendered up to 10 unwarmed chain logos from the trustwallet CDN.
 */
export function warmBundledFlagCache(): void {
  for (const currency of WARM_PRIORITY_CURRENCIES) {
    prefetchRemote(getTokenIconUrl(currency))
  }
  for (const network of WARM_PRIORITY_NETWORKS) {
    prefetchRemote(getNetworkIconUrl(network))
  }
}

/** Warm a single currency flag/token for on-demand screens (accounts, send). */
export function warmNativeCurrencyAssets(currency: string): void {
  const code = String(currency || "").trim().toUpperCase()
  if (!code) return
  prefetchRemote(getTokenIconUrl(code))
}
