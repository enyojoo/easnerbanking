import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { colors, spacing, textStyles, borderRadius, surfaceFrameStyle, surfaceChromeCircleStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'

type Props = {
  title: string
  subtitle: string
  icon: React.ReactNode
  onPress: () => void
  fullWidth?: boolean
}

export function ReceiveLocalRailCard({ title, subtitle, icon, onPress, fullWidth }: Props) {
  return (
    <Pressable
      android_ripple={ripple.neutral}
      style={[styles.card, fullWidth && styles.cardFullWidth, surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl })]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, surfaceChromeCircleStyle(colors, 52, { shadow: 'none' })]}>
        {icon}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 148,
    aspectRatio: 1,
    maxWidth: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
    gap: spacing[2],
  },
  cardFullWidth: {
    maxWidth: '100%',
    aspectRatio: undefined,
    minHeight: 132,
    width: '100%',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  title: {
    ...textStyles.sectionTitle,
    textAlign: 'center',
  },
  subtitle: {
    ...textStyles.caption,
    color: colors.text.secondary,
    textAlign: 'center',
  },
})
