import React from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { PressableScale } from 'pressto'
import { colors, textStyles, spacing, fontFamily } from '../theme'
import { haptics } from '../lib/haptics'

export type SettingsRowProps = {
  title: string
  subtitle: string
  onPress: () => void
  icon: LucideIcon
  rightComponent?: React.ReactNode
  isDestructive?: boolean
  isLast?: boolean
  showChevron?: boolean
}

/** More / settings list row with spring press feedback. */
export function SettingsRow({
  title,
  subtitle,
  onPress,
  icon: IconComponent,
  rightComponent,
  isDestructive = false,
  isLast = false,
  showChevron = true,
}: SettingsRowProps) {
  return (
    <PressableScale
      style={[styles.menuItem, !isLast && styles.menuItemDivider]}
      onPress={() => {
        haptics.tap()
        onPress()
      }}
    >
      <View style={styles.menuItemLeft}>
        <View style={styles.menuItemIconWrap}>
          <IconComponent
            size={18}
            color={isDestructive ? colors.error.main : colors.primary.main}
            strokeWidth={2}
          />
        </View>
        <View style={styles.menuItemTextWrap}>
          <Text style={[styles.menuItemText, isDestructive && styles.destructiveText]}>{title}</Text>
          <Text style={styles.menuItemSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.menuItemRight}>
        {rightComponent}
        {showChevron ? <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} /> : null}
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    minHeight: 64,
    ...(Platform.OS === 'android' ? { overflow: 'hidden' as const } : null),
  },
  menuItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.default,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing[3],
  },
  menuItemIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary.main + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTextWrap: {
    flex: 1,
    gap: 2,
  },
  menuItemText: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  menuItemSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  destructiveText: {
    color: colors.error.main,
  },
})
