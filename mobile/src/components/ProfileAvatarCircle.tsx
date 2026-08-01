import { useEffect, useState, type ReactNode } from 'react'
import { View, StyleSheet, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native'
import { AvatarImage } from './AvatarImage'
import { avatarImageUri } from '../lib/avatarCache'
import { isImageWarm, prefetchImageUri } from '../lib/imageCache'

type ProfileAvatarCircleProps = {
  avatarUrl: unknown
  fallback: ReactNode
  style?: StyleProp<ViewStyle>
  imageStyle?: StyleProp<ImageStyle>
  onError?: () => void
}

/**
 * Profile avatar with initials fallback that hides once the image is warm in cache
 * (PIN, dashboard header, Easetag rows).
 */
export function ProfileAvatarCircle({
  avatarUrl,
  fallback,
  style,
  imageStyle,
  onError,
}: ProfileAvatarCircleProps) {
  const uri = avatarImageUri(avatarUrl)
  const [ready, setReady] = useState(() => Boolean(uri && isImageWarm(uri)))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!uri) {
      setReady(false)
      return
    }
    if (isImageWarm(uri)) {
      setReady(true)
      return
    }
    let cancelled = false
    void prefetchImageUri(uri).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [uri])

  if (!uri || failed) {
    return <View style={style}>{fallback}</View>
  }

  return (
    <View style={[styles.shell, style]}>
      {!ready ? fallback : null}
      <AvatarImage
        avatarUrl={avatarUrl}
        style={[StyleSheet.absoluteFill, imageStyle]}
        prefetch={false}
        onLoad={() => setReady(true)}
        onError={() => {
          setFailed(true)
          onError?.()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
  },
})
