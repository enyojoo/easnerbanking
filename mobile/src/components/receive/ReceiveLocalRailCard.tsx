import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { colors, spacing, textStyles, borderRadius, surfaceFrameStyle, surfaceChromeCircleStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'

type Props = {
  title: string
  subtitle: string
  icon: React.ReactNode
  onPress: () => void
  disabled?: boolean
}

/** Full-width stacked rail row for local deposit (single column list). */
export function ReceiveLocalRailCard({ title, subtitle, icon, onPress, disabled }: Props) {
  return (
    <Pressable
      android_ripple={ripple.neutral}
      style={[
        styles.card,
        surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
        disabled && styles.cardDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={[styles.iconWrap, surfaceChromeCircleStyle(colors, 48, { shadow: 'none' })]}>
        {icon}
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 76,
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    gap: spacing[4],
  },
  cardDisabled: {
    opacity: 0.55,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    ...textStyles.sectionTitle,
  },
  subtitle: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
})
