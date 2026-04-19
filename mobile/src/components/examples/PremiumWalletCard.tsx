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
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import {
  borderRadius,
  spacing,
  shadows,
  textStyles,
  useThemeColors,
} from '../../theme'

/**
 * PremiumWalletCard — a passport-feel credit card for wallets/cards screens.
 *
 * Always graphite on graphite — the only "color" that survives from the old
 * palette is the Easner emerald wordmark in the corner. Balances render in
 * Playfair Display, inverse text, tabular numerals.
 */
export interface PremiumWalletCardProps {
  holder: string
  balance: number
  currency?: string
  last4?: string
  network?: string
  variant?: 'physical' | 'virtual'
  onPressMore?: () => void
  style?: StyleProp<ViewStyle>
  masked?: boolean
}

const MASK = '••••••'

export function PremiumWalletCard({
  holder,
  balance,
  currency = 'USD',
  last4,
  network = 'Easner',
  variant = 'physical',
  onPressMore,
  style,
  masked = false,
}: PremiumWalletCardProps) {
  const palette = useThemeColors()

  const gradient =
    variant === 'physical'
      ? palette.cardGradients.premium
      : palette.cardGradients.blue

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(balance)

  return (
    <View style={[styles.wrapper, shadows.lg, style]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.topRow}>
          <View style={styles.brandBlock}>
            <Text style={[styles.variantPill, { color: palette.text.inverse }]}>
              {variant === 'physical' ? 'PHYSICAL' : 'VIRTUAL'}
            </Text>
            <Text style={[styles.network, { color: palette.primary.main }]}>
              {network}
            </Text>
          </View>
          {onPressMore ? (
            <Pressable
              accessibilityRole={'button' as AccessibilityRole}
              accessibilityLabel="Card options"
              onPress={onPressMore}
              hitSlop={8}
              style={({ pressed }) => [
                styles.moreBtn,
                {
                  backgroundColor: pressed
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(255,255,255,0.06)',
                },
              ]}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={18}
                color={palette.text.inverse}
              />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.balanceBlock}>
          <Text style={[styles.eyebrow, { color: 'rgba(255,255,255,0.6)' }]}>
            AVAILABLE BALANCE
          </Text>
          <Text
            style={[
              textStyles.displaySerifLg,
              styles.balance,
              { color: palette.text.inverse },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {masked ? MASK : formatted}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.holderBlock}>
            <Text style={[styles.meta, { color: 'rgba(255,255,255,0.6)' }]}>
              CARDHOLDER
            </Text>
            <Text style={[styles.holder, { color: palette.text.inverse }]}>
              {holder}
            </Text>
          </View>
          {last4 ? (
            <View>
              <Text style={[styles.meta, { color: 'rgba(255,255,255,0.6)' }]}>
                NUMBER
              </Text>
              <Text style={[styles.last4, { color: palette.text.inverse }]}>
                •••• {last4}
              </Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: borderRadius['2xl'],
  },
  card: {
    borderRadius: borderRadius['2xl'],
    padding: spacing[6],
    minHeight: 200,
    justifyContent: 'space-between',
    gap: spacing[6],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  brandBlock: {
    gap: 4,
  },
  variantPill: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    opacity: 0.75,
  },
  network: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceBlock: {
    gap: spacing[1],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
  },
  balance: {
    fontVariant: ['tabular-nums'],
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  holderBlock: {
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  meta: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  holder: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  last4: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
})
