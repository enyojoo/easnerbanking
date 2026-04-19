import React from 'react'
import {
  View,
  Text,
  TextInput,
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
  shadows,
  textStyles,
  useThemeColors,
} from '../../theme'

/**
 * FxConversionPanel — CFO-style quote card.
 *
 * Two amount fields with a swap affordance, editorial "You receive"
 * amount in Playfair Display, emerald primary action, no other color.
 */
export interface FxConversionPanelProps {
  fromCurrency: string
  toCurrency: string
  fromAmount: string
  onFromAmountChange: (value: string) => void
  rate: number
  toAmount: string
  onSwap?: () => void
  onConfirm?: () => void
  fee?: string
  quoteLabel?: string
  style?: StyleProp<ViewStyle>
}

export function FxConversionPanel({
  fromCurrency,
  toCurrency,
  fromAmount,
  onFromAmountChange,
  rate,
  toAmount,
  onSwap,
  onConfirm,
  fee,
  quoteLabel = 'Mid-market quote',
  style,
}: FxConversionPanelProps) {
  const palette = useThemeColors()

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
      <View
        style={[
          styles.headerBlock,
          { borderBottomColor: palette.semantic.border },
        ]}
      >
        <Text style={[styles.eyebrow, { color: palette.text.secondary }]}>
          {quoteLabel.toUpperCase()}
        </Text>
        <Text style={[styles.rate, { color: palette.text.primary }]}>
          1 {fromCurrency} = {rate.toFixed(4)} {toCurrency}
        </Text>
      </View>

      <View style={styles.fieldBlock}>
        <Text style={[styles.eyebrow, { color: palette.text.secondary }]}>
          YOU SEND
        </Text>
        <View style={styles.inputRow}>
          <View
            style={[
              styles.input,
              {
                borderColor: palette.semantic.border,
                backgroundColor: palette.semantic.background,
              },
            ]}
          >
            <TextInput
              keyboardType="decimal-pad"
              value={fromAmount}
              onChangeText={onFromAmountChange}
              placeholder="0.00"
              placeholderTextColor={palette.text.tertiary}
              style={[
                styles.inputText,
                { color: palette.text.primary },
              ]}
            />
          </View>
          <View
            style={[
              styles.currencyChip,
              {
                borderColor: palette.semantic.border,
                backgroundColor: palette.semantic.muted,
              },
            ]}
          >
            <Text
              style={[
                styles.currencyChipText,
                { color: palette.text.primary },
              ]}
            >
              {fromCurrency}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.swapRow}>
        <View
          style={[
            styles.swapDivider,
            { backgroundColor: palette.semantic.border },
          ]}
        />
        <Pressable
          accessibilityRole={'button' as AccessibilityRole}
          accessibilityLabel="Swap currencies"
          onPress={onSwap}
          style={({ pressed }) => [
            styles.swapButton,
            {
              borderColor: palette.semantic.border,
              backgroundColor: pressed
                ? palette.semantic.muted
                : palette.semantic.card,
            },
          ]}
        >
          <Ionicons
            name="swap-vertical"
            size={18}
            color={palette.text.primary}
          />
        </Pressable>
      </View>

      <View style={styles.fieldBlock}>
        <Text style={[styles.eyebrow, { color: palette.text.secondary }]}>
          YOU RECEIVE
        </Text>
        <View style={styles.inputRow}>
          <View
            style={[
              styles.receiveBox,
              {
                borderColor: palette.semantic.border,
                backgroundColor: palette.semantic.muted,
              },
            ]}
          >
            <Text
              style={[
                textStyles.displaySerifMd,
                styles.receiveAmount,
                { color: palette.text.primary },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {toAmount || '0.00'}
            </Text>
          </View>
          <View
            style={[
              styles.currencyChip,
              {
                borderColor: palette.semantic.border,
                backgroundColor: palette.semantic.muted,
              },
            ]}
          >
            <Text
              style={[
                styles.currencyChipText,
                { color: palette.text.primary },
              ]}
            >
              {toCurrency}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.footer,
          { borderTopColor: palette.semantic.border },
        ]}
      >
        <Text style={[styles.feeText, { color: palette.text.secondary }]}>
          {fee ? `Fee ${fee}` : 'No hidden fees'}
        </Text>
        {onConfirm ? (
          <Pressable
            accessibilityRole={'button' as AccessibilityRole}
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.confirm,
              {
                backgroundColor: palette.primary.main,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.confirmText,
                { color: palette.text.inverse },
              ]}
            >
              Confirm conversion
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerBlock: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    gap: spacing[1],
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '600',
  },
  rate: {
    fontSize: 14,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  fieldBlock: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    gap: spacing[2],
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  input: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
  },
  inputText: {
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  currencyChip: {
    height: 52,
    minWidth: 72,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  currencyChipText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  swapRow: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing[5],
    marginVertical: spacing[2],
    height: 36,
  },
  swapDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
  },
  swapButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiveBox: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
  },
  receiveAmount: {
    fontVariant: ['tabular-nums'],
  },
  footer: {
    marginTop: spacing[5],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  feeText: {
    fontSize: 12,
  },
  confirm: {
    paddingHorizontal: spacing[5],
    paddingVertical: 12,
    borderRadius: borderRadius.full,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
  },
})
