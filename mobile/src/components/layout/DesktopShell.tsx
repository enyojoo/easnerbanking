import React, { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { CONTENT_MAX_WIDTH_DESKTOP, spacing } from '../../theme'
import { DesktopHeader } from './DesktopHeader'
import { DesktopNav } from './DesktopNav'

type DesktopShellProps = {
  children: ReactNode
}

/**
 * Business-style web shell: sidebar | (header + content).
 * Flex row avoids width overflow from margin + 100% width.
 */
export function DesktopShell({ children }: DesktopShellProps) {
  const palette = useThemeColors()
  const { contentMaxWidth } = useResponsiveLayout()

  return (
    <View style={[styles.root, { backgroundColor: palette.background.primary }]}>
      <DesktopNav />
      <View style={styles.contentColumn}>
        <DesktopHeader />
        <View style={styles.main}>
          <View
            style={[
              styles.mainInner,
              { maxWidth: Math.min(contentMaxWidth, CONTENT_MAX_WIDTH_DESKTOP) },
            ]}
          >
            {children}
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    minHeight: '100%',
  },
  contentColumn: {
    flex: 1,
    minWidth: 0,
  },
  main: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing[8],
    paddingBottom: spacing[10],
  },
  mainInner: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    minWidth: 0,
  },
})
