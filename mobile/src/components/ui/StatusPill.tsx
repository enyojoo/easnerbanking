import React, { useMemo } from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react-native'
import {
  borderRadius,
  fontFamily,
  spacing,
  textStyles,
  useThemeColors,
} from '../../theme'
import type { Colors } from '../../theme/colors'

export type StatusPillTone =
  | 'completed'
  | 'pending'
  | 'processing'
  | 'failed'
  | 'cancelled'
  | 'neutral'

export type StatusPillSize = 'sm' | 'md'

export type StatusPillProps = {
  label: string
  tone?: StatusPillTone
  size?: StatusPillSize
  showIcon?: boolean
  style?: ViewStyle | ViewStyle[]
}

/**
 * Rounded-full status badge used on transaction rows, hero cards, and verification rows.
 * Tones map onto theme tokens so the pill stays in sync with global color updates.
 */
export function StatusPill({
  label,
  tone = 'completed',
  size = 'sm',
  showIcon = true,
  style,
}: StatusPillProps) {
  const palette = useThemeColors()
  const styles = useMemo(() => createStyles(palette), [palette])
  const { fg, bg } = resolveTone(palette, tone)

  const iconSize = size === 'sm' ? 10 : 14
  const Icon = pickIcon(tone)

  return (
    <View
      style={[
        styles.base,
        size === 'md' ? styles.padMd : styles.padSm,
        { backgroundColor: bg },
        Array.isArray(style) ? style : style ? [style] : null,
      ]}
    >
      {showIcon && Icon ? (
        <Icon size={iconSize} color={fg} strokeWidth={2.25} />
      ) : null}
      <Text
        style={[
          size === 'md' ? styles.labelMd : styles.labelSm,
          { color: fg },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

function resolveTone(palette: Colors, tone: StatusPillTone) {
  switch (tone) {
    case 'completed':
      return { fg: palette.success.main, bg: palette.success.background }
    case 'pending':
    case 'processing':
      return { fg: palette.warning.main, bg: palette.warning.background }
    case 'failed':
      return { fg: palette.error.main, bg: palette.error.background }
    case 'cancelled':
      return { fg: palette.text.secondary, bg: palette.semantic.muted }
    case 'neutral':
    default:
      return { fg: palette.text.secondary, bg: palette.semantic.muted }
  }
}

function pickIcon(tone: StatusPillTone) {
  switch (tone) {
    case 'completed':
      return CheckCircle2
    case 'pending':
    case 'processing':
      return Clock
    case 'failed':
      return XCircle
    case 'cancelled':
      return AlertCircle
    default:
      return null
  }
}

function createStyles(_palette: Colors) {
  return StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: borderRadius.full,
      alignSelf: 'flex-start',
    },
    padSm: {
      paddingVertical: 1,
      paddingHorizontal: spacing[2],
    },
    padMd: {
      paddingVertical: spacing[1],
      paddingHorizontal: spacing[3],
    },
    labelSm: {
      ...textStyles.bodySmall,
      fontFamily: fontFamily.semibold,
      fontWeight: '600',
      fontSize: 11,
      lineHeight: 14,
    },
    labelMd: {
      ...textStyles.labelMedium,
      fontFamily: fontFamily.semibold,
      fontWeight: '600',
    },
  })
}
