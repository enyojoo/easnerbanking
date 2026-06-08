import React, { type ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { CONTENT_MAX_WIDTH, TABLET_MAX_WIDTH } from '../../theme/layoutMetrics'
import { shadows, spacing } from '../../theme'

type WebViewportFrameProps = {
  children: ReactNode
}

/**
 * Web-only outer frame: phone chrome on mobile widths, centered column on tablet.
 * Desktop mode passes children through — DesktopShell handles layout.
 */
export function WebViewportFrame({ children }: WebViewportFrameProps) {
  const palette = useThemeColors()
  const { mode, isWeb } = useResponsiveLayout()

  if (!isWeb || Platform.OS !== 'web' || mode === 'desktop' || mode === 'tablet') {
    return <>{children}</>
  }

  const maxWidth = mode === 'tablet' ? TABLET_MAX_WIDTH : CONTENT_MAX_WIDTH
  const usePhoneChrome = mode === 'mobile'

  return (
    <View style={[styles.outer, { backgroundColor: palette.background.secondary }]}>
      <View
        style={[
          styles.inner,
          {
            maxWidth,
            backgroundColor: palette.background.primary,
          },
          usePhoneChrome && styles.phoneChrome,
        ]}
      >
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: '100%',
  },
  inner: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  phoneChrome: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 17, 16, 0.12)',
    borderRadius: spacing[4],
    ...shadows.md,
    marginVertical: spacing[4],
    maxHeight: '100%',
  },
})
