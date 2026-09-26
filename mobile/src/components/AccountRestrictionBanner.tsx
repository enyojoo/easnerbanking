import React from 'react'
import { Pressable, View, Text, StyleSheet } from 'react-native'
import {
  ACCOUNT_RESTRICTION_WIND_DOWN_CONTACT_CTA,
  accountRestrictionWindDownBannerCopy,
  type ResolvedAccountRestriction,
} from '@easner/shared'
import { presentIntercomMessenger } from '../lib/intercom'
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
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void presentIntercomMessenger()
        }}
        style={styles.cta}
      >
        <Text style={[styles.ctaText, { color: palette.warning.dark }]}>
          {ACCOUNT_RESTRICTION_WIND_DOWN_CONTACT_CTA}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
    gap: spacing[3],
  },
  text: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  cta: {
    alignSelf: 'flex-start',
  },
  ctaText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
})
