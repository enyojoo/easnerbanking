import React, { useMemo } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useWebStackScreenFocus } from '../hooks/useWebStackScreenFocus'
import { useThemeColors } from '../theme'

interface ScreenWrapperProps {
  children: React.ReactNode
  style?: any
}

export default function ScreenWrapper({ children, style }: ScreenWrapperProps) {
  const insets = useSafeAreaInsets()
  const palette = useThemeColors()
  const { webFocusTargetProps } = useWebStackScreenFocus()
  const dynamic = useMemo(
    () => ({
      flex: 1,
      backgroundColor: palette.background.primary,
    }),
    [palette.background.primary],
  )

  return (
    <View style={[dynamic, { paddingTop: insets.top }, style]}>
      {Platform.OS === 'web' ? (
        <View {...webFocusTargetProps} style={styles.webFocusSentinel} />
      ) : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  webFocusSentinel: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
})
