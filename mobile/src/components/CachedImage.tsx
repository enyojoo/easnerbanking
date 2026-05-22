import { useEffect } from 'react'
import type { ImageStyle, StyleProp } from 'react-native'
import { Image, type ImageProps, type ImageSource } from 'expo-image'
import { IMAGE_CACHE_POLICY, warmImageCache, type ImageCachePolicy } from '../lib/imageCache'
import { BundledImage } from './BundledImage'

export type CachedImageProps = Omit<ImageProps, 'source' | 'cachePolicy'> & {
  /** Remote URL — preferred for avatars and CDN assets. */
  uri?: string | null
  /** Bundled `require()` — routed to {@link BundledImage}, not expo-image. */
  source?: ImageSource | ImageSource[] | number
  cachePolicy?: ImageCachePolicy
  /** Prefetch on mount (default true for remote `uri`). */
  prefetch?: boolean
}

function isBundledRequire(source: CachedImageProps['source']): source is number {
  return typeof source === 'number'
}

/**
 * Remote images: expo-image `memory-disk` cache.
 * Bundled `require()`: react-native `Image` (expo-image + cachePolicy breaks in release).
 */
export function CachedImage({
  uri,
  source,
  cachePolicy = IMAGE_CACHE_POLICY,
  transition = 0,
  prefetch,
  style,
  ...rest
}: CachedImageProps) {
  const trimmedUri = typeof uri === 'string' ? uri.trim() : ''
  const shouldPrefetch = prefetch ?? Boolean(trimmedUri)

  useEffect(() => {
    if (shouldPrefetch && trimmedUri) warmImageCache(trimmedUri)
  }, [shouldPrefetch, trimmedUri])

  if (isBundledRequire(source)) {
    const { contentFit, ...rnRest } = rest
    const resizeMode =
      contentFit === 'contain' ? 'contain' : contentFit === 'fill' ? 'stretch' : 'cover'
    return (
      <BundledImage
        source={source}
        style={style as StyleProp<ImageStyle>}
        resizeMode={resizeMode}
        {...rnRest}
      />
    )
  }

  const resolved: ImageSource | ImageSource[] | undefined =
    source ?? (trimmedUri ? { uri: trimmedUri } : undefined)

  if (!resolved) return null

  return (
    <Image
      source={resolved}
      cachePolicy={cachePolicy}
      recyclingKey={trimmedUri || undefined}
      transition={transition}
      style={style}
      {...rest}
    />
  )
}
