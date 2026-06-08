import React, { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { SIDEBAR_WIDTH, spacing, textStyles } from '../../theme'
import { useActiveRouteNames, navigateFromRoot } from '../../navigation/rootNavigationRef'
import { DESKTOP_TAB_NAV, type DesktopNavItem } from './desktopNavConfig'
import { SidebarBrandHeader } from './SidebarBrandHeader'
import { haptics } from '../../lib/haptics'
import { blurActiveElementOnWeb } from '../../lib/webFocus'
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
    blurActiveElementOnWeb()
    haptics.select()
    if (item.tabScreen) {
      navigateFromRoot('MainTabs', { screen: item.tabScreen })
      return
    }
    navigateFromRoot(item.route)
  }

  return (
    <View style={[styles.sidebar, { paddingBottom: insets.bottom }]}>
      <SidebarBrandHeader />
      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navScrollContent}
        showsVerticalScrollIndicator={false}
      >
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
                size={18}
                color={active ? palette.primary.main : palette.text.secondary}
                strokeWidth={active ? 2.25 : 1.75}
              />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

function createStyles(palette: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    sidebar: {
      width: SIDEBAR_WIDTH,
      flexShrink: 0,
      alignSelf: 'stretch',
      backgroundColor: palette.semantic.card,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: palette.border.default,
    },
    navScroll: {
      flex: 1,
    },
    navScrollContent: {
      paddingHorizontal: spacing[3],
      paddingTop: spacing[5],
      paddingBottom: spacing[4],
      gap: spacing[1],
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
      minHeight: 44,
      paddingVertical: spacing[2],
      paddingHorizontal: spacing[3],
      borderRadius: spacing[3],
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
    },
    navItemActive: {
      backgroundColor: palette.semantic.card,
      borderColor: palette.border.default,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
    },
    navLabel: {
      ...textStyles.bodyMedium,
      color: palette.text.secondary,
      fontWeight: '500',
    },
    navLabelActive: {
      color: palette.text.primary,
      fontWeight: '600',
    },
  })
}
