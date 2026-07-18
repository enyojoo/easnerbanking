import React, { type ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import PinEntryScreen from '../screens/auth/PinEntryScreen'
import { colors } from '../theme'

type MobileAppLockShellProps = {
  locked: boolean
  children: ReactNode
}

/**
 * Full-screen PIN gate (business-style) while keeping the main navigator mounted
 * so browser tab switches and idle unlock do not reset navigation state.
 */
export function MobileAppLockShell({ locked, children }: MobileAppLockShellProps) {
  return (
    <View style={styles.root}>
      <View
        style={[styles.appPane, locked && styles.appPaneLocked]}
        pointerEvents={locked ? 'none' : 'auto'}
        accessibilityElementsHidden={locked}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {locked ? (
        <View style={styles.lockPane}>
          <PinEntryScreen navigation={{} as never} route={{} as never} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
  },
  appPane: {
    flex: 1,
  },
  appPaneLocked: {
    opacity: 0,
  },
  lockPane: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.semantic.background,
    zIndex: 1000,
    ...Platform.select({
      web: {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      },
      default: {},
    }),
  },
})
