import React, { useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
  AccessibilityRole,
} from 'react-native'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react-native'
import {
  borderRadius,
  spacing,
  textStyles,
  shadows,
  useThemeColors,
} from '../../theme'

/**
 * BalanceCard – hero balance moment on mobile.
 *
 * Design intent: private-bank, editorial, tactile. Mirrors the web
 * `BalanceCard` (ivory in light, carbon in dark, sans tabular amount,
 * emerald-only positive delta, no bright red).
 */
export interface BalanceCardProps {
  label?: string
  amount: number
  currency?: string
  deltaPct?: number
  hidden?: boolean
  onToggleHidden?: () => void
  primaryAction?: {
    label: string
    onPress: () => void
  }
  style?: StyleProp<ViewStyle>
}

const MASK = '••••••'

export function BalanceCard({
  label = 'Total balance',
  amount,
  currency = 'USD',
  deltaPct,
  hidden = false,
  onToggleHidden,
  primaryAction,
  style,
}: BalanceCardProps) {
  const palette = useThemeColors()

  const formatted = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount),
    [amount, currency],
  )

  const deltaTone: 'positive' | 'muted' | 'negative' =
    typeof deltaPct === 'number'
      ? deltaPct > 0
        ? 'positive'
        : deltaPct < 0
          ? 'negative'
          : 'muted'
      : 'muted'

  const deltaBackground =
    deltaTone === 'positive'
      ? palette.success.background
      : palette.semantic.muted
  const deltaTextColor =
    deltaTone === 'positive' ? palette.success.main : palette.text.secondary

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.semantic.card,
          borderColor: palette.semantic.border,
          ...shadows.md,
        },
        style,
      ]}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.eyebrow,
              { color: palette.text.secondary },
            ]}
          >
            {label.toUpperCase()}
          </Text>
          {typeof deltaPct === 'number' ? (
            <View
              style={[
                styles.deltaPill,
                { backgroundColor: deltaBackground },
              ]}
            >
              {deltaTone === 'positive' ? (
                <TrendingUp size={12} color={deltaTextColor} strokeWidth={2.5} />
              ) : deltaTone === 'negative' ? (
                <TrendingDown size={12} color={deltaTextColor} strokeWidth={2.5} />
              ) : (
                <Minus size={12} color={deltaTextColor} strokeWidth={2.5} />
              )}
              <Text
                style={[
                  styles.deltaText,
                  { color: deltaTextColor },
                ]}
              >
                {deltaPct > 0 ? '+' : ''}
                {deltaPct.toFixed(2)}%
              </Text>
            </View>
          ) : null}
        </View>

        {onToggleHidden ? (
          <Pressable
            accessibilityRole={'button' as AccessibilityRole}
            accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
            onPress={onToggleHidden}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: pressed
                  ? palette.semantic.muted
                  : 'transparent',
              },
            ]}
            hitSlop={8}
          >
            {hidden ? (
              <Eye size={20} color={palette.text.secondary} strokeWidth={2} />
            ) : (
              <EyeOff size={20} color={palette.text.secondary} strokeWidth={2} />
            )}
          </Pressable>
        ) : null}
      </View>

      <Text
        style={[
          textStyles.balanceDisplay,
          styles.amount,
          { color: palette.text.primary },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {hidden ? MASK : formatted}
      </Text>

      {primaryAction ? (
        <View
          style={[
            styles.footer,
            { borderTopColor: palette.semantic.border },
          ]}
        >
          <Text
            style={[
              styles.footerHint,
              { color: palette.text.secondary },
            ]}
          >
            30-day view
          </Text>
          <Pressable
            accessibilityRole={'button' as AccessibilityRole}
            onPress={primaryAction.onPress}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: palette.primary.main,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: palette.text.inverse },
              ]}
            >
              {primaryAction.label}
            </Text>
            <ArrowRight size={16} color={palette.text.inverse} strokeWidth={2} />
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    padding: spacing[6],
    gap: spacing[5],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '600',
  },
  deltaPill: {
    alignSelf: 'flex-start',
    marginTop: spacing[2],
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    includeFontPadding: false,
  },
  footer: {
    marginTop: spacing[2],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  footerHint: {
    fontSize: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
    borderRadius: borderRadius.full,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
