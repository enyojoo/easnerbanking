import { useEffect, useState } from 'react'
import type { StyleProp, ImageStyle } from 'react-native'
import type { ImageContentFit } from 'expo-image'
import { CachedImage } from './CachedImage'
import { avatarImageUri, warmAvatarCache } from '../lib/avatarCache'

type Props = {
  /** Raw profile / payee avatar URL from API or snapshot. */
  avatarUrl: unknown
  style?: StyleProp<ImageStyle>
  contentFit?: ImageContentFit
  prefetch?: boolean
  onLoad?: () => void
  onError?: () => void
}

/**
 * Profile-style avatar with stable URL normalization, disk cache, and prefetch on mount.
 * Returns `null` when URL is missing or load fails – parent should show initials fallback.
 */
export function AvatarImage({
  avatarUrl,
  style,
  contentFit = 'cover',
  prefetch = true,
  onLoad,
  onError,
}: Props) {
  const uri = avatarImageUri(avatarUrl)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [uri])

  useEffect(() => {
    if (prefetch) warmAvatarCache(uri)
  }, [prefetch, uri])

  if (!uri || failed) return null

  return (
    <CachedImage
      uri={uri}
      style={style}
      contentFit={contentFit}
      prefetch={false}
      onLoad={onLoad}
      onError={() => {
        setFailed(true)
        onError?.()
      }}
    />
  )
}
