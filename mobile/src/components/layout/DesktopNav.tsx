import React, { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { SIDEBAR_WIDTH, spacing, textStyles } from '../../theme'
import { useActiveRouteNames, navigateFromRoot } from '../../navigation/rootNavigationRef'
import { DESKTOP_TAB_NAV, type DesktopNavItem } from './desktopNavConfig'
import { haptics } from '../../lib/haptics'
import { ripple } from '../../lib/androidRipple'

function isNavItemActive(item: DesktopNavItem, activeNames: string[]): boolean {
  if (item.tabScreen) {
    return activeNames.includes('MainTabs') && activeNames.includes(item.tabScreen)
  }
  return activeNames.includes(item.route)
}

export function DesktopNav() {
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(palette), [palette])

  const activeNames = useActiveRouteNames()

  const navigateTo = (item: DesktopNavItem) => {
    haptics.select()
    if (item.tabScreen) {
      navigateFromRoot('MainTabs', { screen: item.tabScreen })
      return
    }
    navigateFromRoot(item.route)
  }

  return (
    <View style={[styles.sidebar, { paddingTop: insets.top + spacing[4], paddingBottom: insets.bottom + spacing[4] }]}>
      <Text style={styles.brand}>Easner</Text>
      <View style={styles.section}>
        {DESKTOP_TAB_NAV.map((item) => {
          const active = isNavItemActive(item, activeNames)
          const Icon = item.icon
          return (
            <Pressable
              key={item.id}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => navigateTo(item)}
              android_ripple={ripple.neutral}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Icon
                size={20}
                color={active ? palette.primary.main : palette.text.secondary}
                strokeWidth={active ? 2.25 : 1.75}
              />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function createStyles(palette: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    sidebar: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: SIDEBAR_WIDTH,
      backgroundColor: palette.semantic.card,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: palette.border.default,
      zIndex: 20,
    },
    brand: {
      ...textStyles.titleLarge,
      color: palette.text.primary,
      fontWeight: '700',
      paddingHorizontal: spacing[5],
      marginBottom: spacing[6],
    },
    section: {
      paddingHorizontal: spacing[3],
      gap: spacing[1],
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
      paddingVertical: spacing[3],
      paddingHorizontal: spacing[3],
      borderRadius: spacing[3],
    },
    navItemActive: {
      backgroundColor: palette.semantic.muted,
    },
    navLabel: {
      ...textStyles.bodyMedium,
      color: palette.text.secondary,
      fontWeight: '500',
    },
    navLabelActive: {
      color: palette.primary.main,
      fontWeight: '600',
    },
  })
}
