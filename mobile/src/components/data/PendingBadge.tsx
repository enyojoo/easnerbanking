import React from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../../contexts/ThemePaletteContext'

/**
 * Subtle "pending" pill for optimistic ledger rows.
 *
 * Rule: optimistic styling must NEVER imply the transfer is final. Keep
 * the badge quiet, not celebratory.
 */
export function PendingBadge({
  label = 'Pending',
  style,
}: {
  label?: string
  style?: ViewStyle
}) {
  const colors = useThemeColors()
  return (
    <View
      style={[
        styles.pill,
        {
          borderColor: colors.semantic.border,
          backgroundColor: colors.semantic.muted,
        },
        style,
      ]}
    >
      <Ionicons name="time-outline" size={10} color={colors.text.tertiary} />
      <Text style={[styles.label, { color: colors.text.tertiary }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
})
