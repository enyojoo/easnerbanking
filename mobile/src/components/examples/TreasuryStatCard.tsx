import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native'
import {
  borderRadius,
  spacing,
  shadows,
  useThemeColors,
} from '../../theme'

/**
 * TreasuryStatCard — KPI tile for balances, volumes, counts.
 *
 * Deltas are monochrome except positive movement which earns emerald.
 */
export interface TreasuryStatCardProps {
  label: string
  value: string | number
  unit?: string
  deltaPct?: number
  helper?: string
  style?: StyleProp<ViewStyle>
}

export function TreasuryStatCard({
  label,
  value,
  unit,
  deltaPct,
  helper,
  style,
}: TreasuryStatCardProps) {
  const palette = useThemeColors()

  const direction =
    typeof deltaPct === 'number'
      ? deltaPct > 0
        ? 'up'
        : deltaPct < 0
          ? 'down'
          : 'flat'
      : undefined

  const deltaBg =
    direction === 'up' ? palette.success.background : palette.semantic.muted
  const deltaFg =
    direction === 'up' ? palette.success.main : palette.text.secondary

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.semantic.card,
          borderColor: palette.semantic.border,
          ...shadows.sm,
        },
        style,
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: palette.text.secondary }]}>
          {label.toUpperCase()}
        </Text>
        {direction ? (
          <View style={[styles.deltaPill, { backgroundColor: deltaBg }]}>
            {direction === 'up' ? (
              <TrendingUp size={12} color={deltaFg} strokeWidth={2.5} />
            ) : direction === 'down' ? (
              <TrendingDown size={12} color={deltaFg} strokeWidth={2.5} />
            ) : (
              <Minus size={12} color={deltaFg} strokeWidth={2.5} />
            )}
            <Text style={[styles.deltaText, { color: deltaFg }]}>
              {(deltaPct ?? 0) > 0 ? '+' : ''}
              {(deltaPct ?? 0).toFixed(2)}%
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: palette.text.primary }]}>
          {value}
        </Text>
        {unit ? (
          <Text style={[styles.unit, { color: palette.text.secondary }]}>
            {unit}
          </Text>
        ) : null}
      </View>

      {helper ? (
        <Text style={[styles.helper, { color: palette.text.secondary }]}>
          {helper}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing[5],
    gap: spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '600',
  },
  deltaPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[1],
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 14,
    fontWeight: '600',
  },
  helper: {
    fontSize: 12,
  },
})
