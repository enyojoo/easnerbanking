import { Image } from 'expo-image'

/** Default for all remote images — memory + disk so revisits and cold resume stay instant. */
export const IMAGE_CACHE_POLICY = 'memory-disk' as const

export type ImageCachePolicy = typeof IMAGE_CACHE_POLICY | 'disk' | 'memory' | 'none'

/**
 * Prefetch a remote image into expo-image's disk cache (used by {@link CachedImage}).
 * Safe to call repeatedly; failures are ignored.
 */
export async function prefetchImageUri(uri: string | null | undefined): Promise<void> {
  const trimmed = typeof uri === 'string' ? uri.trim() : ''
  if (!trimmed) return
  try {
    await Image.prefetch(trimmed, { cachePolicy: IMAGE_CACHE_POLICY })
  } catch {
    // ignore — network / decode errors should not break UI
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
