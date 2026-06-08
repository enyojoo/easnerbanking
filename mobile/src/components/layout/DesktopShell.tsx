import React, { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { HEADER_HEIGHT, SIDEBAR_WIDTH, spacing } from '../../theme'
import { DesktopHeader } from './DesktopHeader'
import { DesktopNav } from './DesktopNav'

type DesktopShellProps = {
  children: ReactNode
}

/**
 * Business-style web shell: fixed sidebar | scrollable content + top header.
 * Used for tablet and desktop breakpoints on Expo web.
 */
export function DesktopShell({ children }: DesktopShellProps) {
  const palette = useThemeColors()
  const { contentMaxWidth } = useResponsiveLayout()

  return (
    <View style={[styles.root, { backgroundColor: palette.background.primary }]}>
      <DesktopNav />
      <DesktopHeader />
      <View
        style={[
          styles.main,
          {
            marginLeft: SIDEBAR_WIDTH,
            paddingTop: HEADER_HEIGHT,
          },
        ]}
      >
        <View style={[styles.mainInner, { maxWidth: contentMaxWidth }]}>
          <View style={styles.contentColumn}>{children}</View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
  },
  main: {
    flex: 1,
    width: '100%',
    paddingHorizontal: spacing[8],
    paddingBottom: spacing[10],
  },
  mainInner: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  contentColumn: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
})
