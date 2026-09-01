import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { accountRestrictionWindDownBannerCopy, type ResolvedAccountRestriction } from '@easner/shared'
import { borderRadius, fontSize, spacing, useThemeColors } from '../theme'

export function AccountRestrictionBanner({
  restriction,
}: {
  restriction: ResolvedAccountRestriction
}) {
  const palette = useThemeColors()

  if (!restriction.active || restriction.phase !== 'wind_down') return null

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.warning.background,
          borderColor: palette.warning.light,
        },
      ]}
    >
      <Text style={[styles.text, { color: palette.warning.dark }]}>
        {accountRestrictionWindDownBannerCopy(restriction.windDownEndsAt)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
  },
  text: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
})
