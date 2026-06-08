import React, { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { CONTENT_MAX_WIDTH, HEADER_HEIGHT, SIDEBAR_WIDTH, spacing } from '../../theme'
import { DesktopHeader } from './DesktopHeader'
import { DesktopNav } from './DesktopNav'

type DesktopShellProps = {
  children: ReactNode
}

export function DesktopShell({ children }: DesktopShellProps) {
  const palette = useThemeColors()

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
        <View style={styles.mainInner}>
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
    alignItems: 'center',
    paddingHorizontal: spacing[4],
  },
  mainInner: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  contentColumn: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
})
