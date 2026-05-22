import { useEffect } from 'react'
import { Image, type ImageProps, type ImageSource } from 'expo-image'
import { IMAGE_CACHE_POLICY, warmImageCache, type ImageCachePolicy } from '../lib/imageCache'

export type CachedImageProps = Omit<ImageProps, 'source' | 'cachePolicy'> & {
  /** Remote URL — preferred for avatars and CDN assets. */
  uri?: string | null
  /** Bundled `require()` or explicit expo-image source. */
  source?: ImageSource | ImageSource[]
  cachePolicy?: ImageCachePolicy
  /** Prefetch on mount (default true for remote `uri`). */
  prefetch?: boolean
}

/**
 * App-standard remote/bundled image with expo-image `memory-disk` caching.
 * Use this (or {@link AvatarImage}) instead of react-native `Image` for URLs.
 */
export function CachedImage({
  uri,
  source,
  cachePolicy = IMAGE_CACHE_POLICY,
  transition = 0,
  prefetch,
  ...rest
}: CachedImageProps) {
  const trimmedUri = typeof uri === 'string' ? uri.trim() : ''
  const resolved: ImageSource | ImageSource[] | undefined =
    source ?? (trimmedUri ? { uri: trimmedUri } : undefined)
  const shouldPrefetch = prefetch ?? Boolean(trimmedUri)

  useEffect(() => {
    if (shouldPrefetch && trimmedUri) warmImageCache(trimmedUri)
  }, [shouldPrefetch, trimmedUri])

  if (!resolved) return null

  return (
    <Image
      source={resolved}
      cachePolicy={cachePolicy}
      recyclingKey={trimmedUri || undefined}
      transition={transition}
      {...rest}
    />
  )
}
