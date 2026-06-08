import React, { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LogOut } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../contexts/AuthContext'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { SIDEBAR_WIDTH, spacing, textStyles } from '../../theme'
import { useActiveRouteNames, navigateFromRoot } from '../../navigation/rootNavigationRef'
import { DESKTOP_FOOTER_NAV, DESKTOP_PRIMARY_NAV, type DesktopNavItem } from './desktopNavConfig'
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
  const { signOut } = useAuth()
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

  const renderItem = (item: DesktopNavItem) => {
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
  }

  return (
    <View style={[styles.sidebar, { paddingTop: insets.top + spacing[4], paddingBottom: insets.bottom + spacing[4] }]}>
      <Text style={styles.brand}>Easner</Text>
      <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>{DESKTOP_PRIMARY_NAV.map(renderItem)}</View>
        <View style={styles.sectionDivider} />
        <View style={styles.section}>{DESKTOP_FOOTER_NAV.map(renderItem)}</View>
      </ScrollView>
      <Pressable
        style={styles.signOut}
        onPress={() => {
          haptics.tap()
          void signOut()
        }}
        android_ripple={ripple.neutral}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <LogOut size={20} color={palette.error.main} strokeWidth={2} />
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
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
    navScroll: {
      flex: 1,
    },
    section: {
      paddingHorizontal: spacing[3],
      gap: spacing[1],
    },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: palette.border.default,
      marginVertical: spacing[4],
      marginHorizontal: spacing[5],
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
    signOut: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
      paddingVertical: spacing[3],
      paddingHorizontal: spacing[5],
      marginTop: spacing[2],
    },
    signOutLabel: {
      ...textStyles.bodyMedium,
      color: palette.error.main,
      fontWeight: '500',
    },
  })
}
