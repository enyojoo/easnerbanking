import React, { useMemo } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../theme'

interface ScreenWrapperProps {
  children: React.ReactNode
  style?: any
}

export default function ScreenWrapper({ children, style }: ScreenWrapperProps) {
  const insets = useSafeAreaInsets()
  const palette = useThemeColors()
  const dynamic = useMemo(
    () => ({
      flex: 1,
      backgroundColor: palette.background.primary,
    }),
    [palette.background.primary],
  )

  return (
    <View style={[dynamic, { paddingTop: insets.top }, style]}>
      {children}
    </View>
  )
}
