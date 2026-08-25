import { useEffect, useState, type ReactNode } from 'react'
import { View, StyleSheet, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native'
import { AvatarImage } from './AvatarImage'
import { avatarImageUri } from '../lib/avatarCache'

/**
 * Profile avatar with initials fallback (PIN, dashboard header, Easetag rows).
 *
 * The fallback renders BEHIND the image unconditionally — no JS "warm" gate.
 * An earlier version painted initials over the photo until an async
 * `isImageWarm`/prefetch round-trip resolved, which lost its own race against
 * the boot-time warm-index hydration and flashed initials→photo on every cold
 * start even when expo-image had the bytes on disk. expo-image with
 * `cachePolicy="memory-disk"` and `transition={0}` paints a cached image on
 * the first frame; while a cold image streams in, it is transparent and the
 * initials show through — same placeholder UX, zero added delay.
 */
export function ProfileAvatarCircle({
  avatarUrl,
  fallback,
  style,
  imageStyle,
  onError,
}: {
  avatarUrl: unknown
  fallback: ReactNode
  style?: StyleProp<ViewStyle>
  imageStyle?: StyleProp<ImageStyle>
  onError?: () => void
}) {
  const uri = avatarImageUri(avatarUrl)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [uri])

  if (!uri || failed) {
    return <View style={[styles.fallbackHost, style]}>{fallback}</View>
  }

  return (
    <View style={[styles.shell, style]}>
      <View style={[styles.fallbackHost, StyleSheet.absoluteFill]}>{fallback}</View>
      <AvatarImage
        avatarUrl={avatarUrl}
        style={[StyleSheet.absoluteFill, imageStyle]}
        prefetch={false}
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
  /** Keep initials (or other fallback) optically centered in the circle. */
  fallbackHost: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
