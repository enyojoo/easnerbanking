import React, { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import NetInfo from '@react-native-community/netinfo'
import { spacing, textStyles, useThemeColors, zIndex } from '../theme'

function subscribeOnline(onChange: (online: boolean) => void): () => void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const emit = () => onChange(window.navigator.onLine)
    emit()
    window.addEventListener('online', emit)
    window.addEventListener('offline', emit)
    return () => {
      window.removeEventListener('online', emit)
      window.removeEventListener('offline', emit)
    }
  }
  return NetInfo.addEventListener((state) => {
    onChange(state.isConnected !== false)
  })
}

export function OfflineBanner() {
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()
  const [online, setOnline] = useState(true)

  useEffect(() => subscribeOnline(setOnline), [])

  if (online) return null

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + spacing[2],
          backgroundColor: palette.warning.background,
        },
      ]}
    >
      <Text style={[styles.text, { color: palette.warning.dark }]}>
        You’re offline. Balances may be out of date.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: zIndex.sticky,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    alignItems: 'center',
  },
  text: {
    ...textStyles.bodySmall,
    fontWeight: '600',
    textAlign: 'center',
  },
})
