import React from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
  AccessibilityRole,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  borderRadius,
  spacing,
  useThemeColors,
} from '../../theme'

/**
 * TransactionRow — executive ledger line.
 *
 * Rules mirror web:
 *   - Credits: emerald-tinted avatar + emerald amount.
 *   - Debits: neutral graphite — never bright red.
 *   - Amounts use tabular figures for alignment.
 */
export interface TransactionRowProps {
  description: string
  type: string
  date: string | Date
  amount: number
  currency?: string
  direction: 'credit' | 'debit'
  status?: 'completed' | 'pending' | 'processing' | 'failed'
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}

const STATUS_LABEL: Record<
  NonNullable<TransactionRowProps['status']>,
  string
> = {
  completed: 'Completed',
  pending: 'Pending',
  processing: 'Processing',
  failed: 'Failed',
}

export function TransactionRow({
  description,
  type,
  date,
  amount,
  currency = 'USD',
  direction,
  status,
  onPress,
  style,
}: TransactionRowProps) {
  const palette = useThemeColors()
  const isCredit = direction === 'credit'

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount))

  const dateLabel = new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const iconBg = isCredit ? palette.success.background : palette.semantic.muted
  const iconColor = isCredit ? palette.success.main : palette.text.secondary
  const amountColor = isCredit ? palette.success.main : palette.text.primary

  const statusPalette: Record<
    NonNullable<TransactionRowProps['status']>,
    { bg: string; fg: string }
  > = {
    completed: { bg: palette.success.background, fg: palette.success.main },
    pending: { bg: palette.warning.background, fg: palette.warning.main },
    processing: { bg: palette.warning.background, fg: palette.warning.main },
    failed: { bg: palette.error.background, fg: palette.error.main },
  }

  const Container = onPress ? Pressable : View

  return (
    <Container
      accessibilityRole={onPress ? ('button' as AccessibilityRole) : undefined}
      onPress={onPress}
      style={({ pressed }: { pressed?: boolean } = {}) => [
        styles.row,
        {
          backgroundColor: pressed ? palette.semantic.muted : 'transparent',
        },
        style,
      ]}
    >
      <View style={styles.left}>
        <View
          style={[
            styles.icon,
            {
              backgroundColor: iconBg,
              borderColor: palette.semantic.border,
            },
          ]}
        >
          <Ionicons
            name={isCredit ? 'arrow-down' : 'arrow-up'}
            size={16}
            color={iconColor}
          />
        </View>
        <View style={styles.textBlock}>
          <Text
            numberOfLines={1}
            style={[styles.description, { color: palette.text.primary }]}
          >
            {description}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.meta, { color: palette.text.secondary }]}
          >
            <Text style={styles.metaType}>{type.toUpperCase()}</Text>
            {'  ·  '}
            <Text>{dateLabel}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        {status ? (
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusPalette[status].bg },
            ]}
          >
            <Text
              style={[styles.statusText, { color: statusPalette[status].fg }]}
            >
              {STATUS_LABEL[status]}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.amount, { color: amountColor }]}>
          {isCredit ? '+' : '−'}
          {formatted}
        </Text>
      </View>
    </Container>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minWidth: 0,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  description: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
  },
  metaType: {
    letterSpacing: 0.6,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  statusBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
})
