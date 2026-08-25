import React, { type ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import PinEntryScreen from '../screens/auth/PinEntryScreen'
import { colors } from '../theme'

type MobileAppLockShellProps = {
  locked: boolean
  children: ReactNode
}

/**
 * Full-screen PIN overlay while keeping the main navigator mounted so tab
 * return and idle unlock do not reset navigation state (M2.4).
 *
 * Used on both web and native. `PinEntryScreen` is rendered directly (not via
 * a nested Stack.Navigator) because two sibling navigators under one
 * NavigationContainer are not allowed; the screen never uses its navigation
 * prop — unlock is signalled through the app-lock bus (`emitAppLocked`).
 *
 * While locked, the app pane is hidden (opacity 0), non-interactive
 * (`pointerEvents="none"`) and removed from the accessibility tree; the lock
 * pane paints an opaque background above it, so no content leaks through.
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
