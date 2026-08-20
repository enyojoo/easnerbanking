import AsyncStorage from '@react-native-async-storage/async-storage'
import { Image } from 'expo-image'

/** Default for all remote images – memory + disk so revisits and cold resume stay instant. */
export const IMAGE_CACHE_POLICY = 'memory-disk' as const

export type ImageCachePolicy = typeof IMAGE_CACHE_POLICY | 'disk' | 'memory' | 'none'

const WARM_URLS_STORAGE_KEY = '@easner_img_warm_v1'
const WARM_URLS_MAX = 400

const warmedUrls = new Set<string>()
let warmUrlsHydrated = false
let warmUrlsHydratePromise: Promise<void> | null = null

async function persistWarmUrls(): Promise<void> {
  try {
    const list = [...warmedUrls].slice(-WARM_URLS_MAX)
    await AsyncStorage.setItem(WARM_URLS_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // quota / private mode
  }
}

/** Restore warmed URL index from prior sessions (instant avatar/flag paint). */
export async function hydrateWarmImageUrls(): Promise<void> {
  if (warmUrlsHydrated) return
  if (warmUrlsHydratePromise) return warmUrlsHydratePromise

  warmUrlsHydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(WARM_URLS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return
      for (const url of parsed) {
        if (typeof url === 'string' && url.trim()) warmedUrls.add(url.trim())
      }
    } catch {
      // ignore
    } finally {
      warmUrlsHydrated = true
    }
  })()

  return warmUrlsHydratePromise
}

export function isImageWarm(uri: string | null | undefined): boolean {
  const trimmed = typeof uri === 'string' ? uri.trim() : ''
  return trimmed.length > 0 && warmedUrls.has(trimmed)
}

export function markImageWarm(uri: string | null | undefined): void {
  const trimmed = typeof uri === 'string' ? uri.trim() : ''
  if (!trimmed || warmedUrls.has(trimmed)) return
  warmedUrls.add(trimmed)
  void persistWarmUrls()
}

/**
 * Prefetch a remote image into expo-image's disk cache (used by {@link CachedImage}).
 * Safe to call repeatedly; failures are ignored.
 */
export async function prefetchImageUri(uri: string | null | undefined): Promise<void> {
  const trimmed = typeof uri === 'string' ? uri.trim() : ''
  if (!trimmed) return
  if (isImageWarm(trimmed)) return
  try {
    await Image.prefetch(trimmed, { cachePolicy: IMAGE_CACHE_POLICY })
    markImageWarm(trimmed)
  } catch {
    // ignore – network / decode errors should not break UI
  }
}

/** Fire-and-forget prefetch for navigation hooks and auth hydration. */
export function warmImageCache(uri: string | null | undefined): void {
  void prefetchImageUri(uri)
}

/** Batch prefetch (deduped). */
export async function prefetchImageUris(uris: Iterable<string | null | undefined>): Promise<void> {
  const unique = [
    ...new Set(
      [...uris]
        .map((u) => (typeof u === 'string' ? u.trim() : ''))
        .filter((u) => u.length > 0),
    ),
  ]
  await Promise.allSettled(unique.map((u) => prefetchImageUri(u)))
}
