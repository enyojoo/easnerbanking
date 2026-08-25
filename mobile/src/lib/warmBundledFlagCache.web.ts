/**
 * Expo-web flag warmer.
 *
 * The old version re-exported the Next.js warmer, which warms `/flags/*.png`
 * — a Next-only public-dir convention. Those paths do not exist on the
 * expo-web host (vercel.json's catch-all rewrite serves index.html for
 * them), so warm coverage was 0% and every flag popped in on first render.
 * On expo web the real assets are the metro-hashed URLs behind the SAME
 * bundled `require()` manifest native uses — warm those, all 203 of them,
 * chunked at idle (priority ISOs first, immediately).
 */
import { Asset } from 'expo-asset'
import { FLAG_ASSETS } from '../../../packages/shared/src/flags/flag-assets.manifest'
import { getTokenIconUrl } from '../../../packages/shared/src/crypto-icons'
import {
  WARM_PRIORITY_CURRENCIES,
  WARM_PRIORITY_ISOS,
} from '../../../packages/shared/src/flags/warm-priority-assets'
import { flagIsoForCurrency } from '../../../packages/shared/src/flags/flag-source'
import { isImageWarm, markImageWarm } from './imageCache'

function flagAssetUri(iso: string): string | null {
  const moduleId = FLAG_ASSETS[iso]
  if (moduleId == null) return null
  try {
    return Asset.fromModule(moduleId).uri ?? null
  } catch {
    return null
  }
}

/** DOM-native warm: guaranteed on web, marks the shared warm index. */
function warmWebUri(uri: string | null | undefined): void {
  const trimmed = typeof uri === 'string' ? uri.trim() : ''
  if (!trimmed || isImageWarm(trimmed) || typeof window === 'undefined') return
  const img = new window.Image()
  img.onload = () => markImageWarm(trimmed)
  img.src = trimmed
}

export function warmNativeCurrencyAssets(currency: string): void {
  const iso = flagIsoForCurrency(currency)
  if (iso) warmWebUri(flagAssetUri(iso))
  warmWebUri(getTokenIconUrl(currency))
}

export function warmBundledFlagCache(): void {
  if (typeof window === 'undefined') return

  // Priority set immediately: the currencies/countries on the first screens.
  for (const iso of WARM_PRIORITY_ISOS) warmWebUri(flagAssetUri(iso))
  for (const currency of WARM_PRIORITY_CURRENCIES) warmNativeCurrencyAssets(currency)

  // Everything else in idle-time chunks so country pickers arrive complete.
  const pending = Object.keys(FLAG_ASSETS)
    .map((iso) => flagAssetUri(iso))
    .filter((uri): uri is string => Boolean(uri) && !isImageWarm(uri as string))
  if (pending.length === 0) return

  const CHUNK_SIZE = 12
  let index = 0
  const w = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  }
  const scheduleNext = () => {
    if (index >= pending.length) return
    const run = () => {
      for (const uri of pending.slice(index, index + CHUNK_SIZE)) warmWebUri(uri)
      index += CHUNK_SIZE
      scheduleNext()
    }
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(run, { timeout: 5_000 })
    } else {
      setTimeout(run, 250)
    }
  }
  scheduleNext()
}
