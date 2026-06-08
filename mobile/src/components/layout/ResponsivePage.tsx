import React, { type ReactNode } from 'react'
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { spacing } from '../../theme'

type ResponsivePageProps = {
  children: ReactNode
  scroll?: boolean
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
}

export function ResponsivePage({
  children,
  scroll = true,
  style,
  contentContainerStyle,
}: ResponsivePageProps) {
  const { mode } = useResponsiveLayout()
  const centered = mode === 'tablet' || mode === 'desktop'

  const inner = (
    <View
      style={[
        styles.inner,
        centered && styles.centered,
        contentContainerStyle,
      ]}
    >
      {children}
    </View>
  )

  if (!scroll) {
    return <View style={[styles.root, style]}>{inner}</View>
  }

  return (
    <ScrollView
      style={[styles.root, style]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {inner}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
  },
  inner: {
    width: '100%',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
  },
  centered: {
    alignSelf: 'center',
  },
})
