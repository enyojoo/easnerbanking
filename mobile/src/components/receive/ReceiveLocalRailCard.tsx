import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { ArrowRight } from 'lucide-react-native'
import { colors, spacing, textStyles, borderRadius, surfaceFrameStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'

const FLAG_SIZE = 48

type Props = {
  title: string
  subtitle: string
  leading: React.ReactNode
  onPress: () => void
  disabled?: boolean
}

/** Full-width stacked rail row for receive cash / local deposit (single column list). */
export function ReceiveLocalRailCard({ title, subtitle, leading, onPress, disabled }: Props) {
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
      <View style={styles.flagWrap}>{leading}</View>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <ArrowRight size={20} color={colors.text.tertiary} strokeWidth={2} />
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
  flagWrap: {
    width: FLAG_SIZE,
    height: FLAG_SIZE,
    borderRadius: FLAG_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    backgroundColor: colors.primary.main + '10',
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
