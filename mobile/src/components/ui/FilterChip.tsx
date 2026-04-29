import React, { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import {
  borderRadius,
  fontFamily,
  spacing,
  textStyles,
  useThemeColors,
} from '../../theme'
import type { Colors } from '../../theme/colors'
import { ripple } from '../../lib/androidRipple'

export type FilterChipProps = {
  label: string
  selected?: boolean
  onPress?: () => void
  style?: ViewStyle | ViewStyle[]
  /** Optional small badge (e.g. count) on the right side. */
  badge?: string | number
}

/**
 * Horizontal filter chip used in lists like Activity. Active = primary blue fill, inactive = white card with hairline.
 */
export function FilterChip({
  label,
  selected = false,
  onPress,
  style,
  badge,
}: FilterChipProps) {
  const palette = useThemeColors()
  const styles = useMemo(() => createStyles(palette), [palette])

  const handlePress = () => {
    if (!onPress) return
    Haptics.selectionAsync().catch(() => {})
    onPress()
  }

  return (
    <Pressable
      android_ripple={ripple.neutral}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        selected ? styles.active : styles.inactive,
        pressed ? styles.pressed : null,
        Array.isArray(style) ? style : style ? [style] : null,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text
        style={[styles.label, selected ? styles.labelActive : styles.labelInactive]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {badge != null ? (
        <View style={[styles.badge, selected ? styles.badgeActive : styles.badgeInactive]}>
          <Text
            style={[
              styles.badgeText,
              selected ? styles.badgeTextActive : styles.badgeTextInactive,
            ]}
          >
            {String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      height: 36,
      borderRadius: borderRadius.full,
    },
    active: {
      backgroundColor: c.primary.main,
    },
    inactive: {
      backgroundColor: c.semantic.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
    },
    pressed: {
      opacity: 0.85,
    },
    label: {
      ...textStyles.labelMedium,
      fontFamily: fontFamily.semibold,
      fontWeight: '600',
      fontSize: 14,
    },
    labelActive: {
      color: c.text.inverse,
    },
    labelInactive: {
      color: c.text.primary,
    },
    badge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: spacing[1],
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeActive: {
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    badgeInactive: {
      backgroundColor: c.semantic.muted,
    },
    badgeText: {
      fontSize: 11,
      fontFamily: fontFamily.semibold,
      fontWeight: '600',
    },
    badgeTextActive: {
      color: c.text.inverse,
    },
    badgeTextInactive: {
      color: c.text.secondary,
    },
  })
}
