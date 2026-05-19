import { Image } from "expo-image"
import { FLAG_ASSETS } from "./flag-assets.manifest"

/** Warm expo-image cache for bundled flag PNGs (call once on app start). */
export function warmBundledFlagCache(): void {
  for (const source of Object.values(FLAG_ASSETS)) {
    if (source) {
      void Image.prefetch(source).catch(() => undefined)
    }
  }
}
