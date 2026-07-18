import React from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  Keyboard,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowUpDown, ChevronDown } from 'lucide-react-native'
import SkeletonLoader from '../SkeletonLoader'
import {
  colors,
  surfaceFrameStyle,
  textStyles,
  borderRadius,
  spacing,
  fontFamily,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { CurrencyFlag } from '../flags/CurrencyFlag'
import { CountryFlag } from '../flags/CountryFlag'
import { getCurrencySymbol } from '../../utils/formatters'
import { getSendAmountFieldSymbol } from '../../lib/sendAmountFieldSymbol'
import { formatMoneyDisplay, formatSendRateLabel } from '@easner/shared'

export type ReceiveLocalAmountShellWebFormProps = {
  usdBalance: number
  amountEntryMode: 'usd' | 'local'
  amountStr: string
  displayCurrency: string
  localPayInCurrency: string
  residenceCountry: string
  railLabel: string
  amountPositive: boolean
  showExchangePreviewSkeleton: boolean
  exchangePreviewReady: boolean
  amountLimitMessage?: string | null
  previewLocalPayIn: number
  previewUsdCredit: number
  customerRate: number | null
  bankAvailable: boolean
  momoAvailable: boolean
  canContinue: boolean
  isContinueLoading: boolean
  onAmountChange: (text: string) => void
  onToggleAmountDirection: () => void
  onChangeRail: () => void
  onContinue: () => void
}

export function ReceiveLocalAmountShellWebForm({
  usdBalance,
  amountEntryMode,
  amountStr,
  displayCurrency,
  localPayInCurrency,
  residenceCountry,
  railLabel,
  amountPositive,
  showExchangePreviewSkeleton,
  exchangePreviewReady,
  amountLimitMessage,
  previewLocalPayIn,
  previewUsdCredit,
  customerRate,
  bankAvailable,
  momoAvailable,
  canContinue,
  isContinueLoading,
  onAmountChange,
  onToggleAmountDirection,
  onChangeRail,
  onContinue,
}: ReceiveLocalAmountShellWebFormProps) {
  const amountSymbol = getSendAmountFieldSymbol(displayCurrency)
  const canChangeRail = bankAvailable && momoAvailable
  const showExchangeHeader = amountPositive

  const renderExchangeHeader = () => {
    if (!showExchangeHeader) {
      return <View style={styles.exchangeHeaderSpacer} />
    }
    if (showExchangePreviewSkeleton) {
      return <SkeletonLoader width={200} height={14} borderRadius={7} />
    }
    if (amountLimitMessage) {
      return (
        <Text style={styles.exchangeError} numberOfLines={2}>
          {amountLimitMessage}
        </Text>
      )
    }
    if (exchangePreviewReady && customerRate) {
      return (
        <Pressable
          android_ripple={ripple.neutral}
          onPress={onToggleAmountDirection}
          style={styles.exchangeToggleRow}
        >
          <ArrowUpDown size={14} color={colors.primary.main} strokeWidth={2.5} />
          <Text style={styles.exchangeInfoText} numberOfLines={1}>
            {amountEntryMode === 'usd'
              ? `Paying: ${formatMoneyDisplay(previewLocalPayIn, localPayInCurrency)}`
              : `Receiving: ${formatMoneyDisplay(previewUsdCredit, 'USD')}`}
            {' • '}
            {`Rate: ${formatSendRateLabel('USD', localPayInCurrency, customerRate)}`}
          </Text>
        </Pressable>
      )
    }
    return (
      <Text style={styles.exchangeError} numberOfLines={2}>
        Exchange rate unavailable. Try again shortly.
      </Text>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <Text style={styles.fieldLabel}>To</Text>
        <View style={[styles.destinationSelector, surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.lg })]}>
          <Text style={styles.destinationToLabel}>To:</Text>
          <CurrencyFlag currency="USD" size={22} style={styles.destinationFlag} />
          <Text style={styles.destinationText} numberOfLines={1}>
            USD Balance • {getCurrencySymbol('USD')}
            {usdBalance.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={[styles.amountLabelRow, showExchangeHeader && styles.amountLabelRowTall]}>
          <Text style={styles.fieldLabel}>Amount ({displayCurrency})</Text>
          <View style={styles.exchangeHeaderSlot}>{renderExchangeHeader()}</View>
        </View>

        <View style={styles.amountInputBox}>
          <Text style={styles.amountSymbol}>{amountSymbol}</Text>
          <TextInput
            style={styles.amountTextInput}
            value={amountStr === '0' ? '' : amountStr}
            onChangeText={onAmountChange}
            placeholder="0.00"
            placeholderTextColor={colors.text.tertiary}
            keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
            inputMode="decimal"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            accessibilityLabel={`Amount ${amountSymbol}${amountStr}`}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Paying via</Text>
        <Pressable
          android_ripple={ripple.neutral}
          onPress={onChangeRail}
          disabled={!canChangeRail}
          style={styles.sourceSelector}
        >
          <View style={styles.sourceSelectorLeft}>
            <CountryFlag code={residenceCountry} size={22} style={styles.sourceFlag} />
            <Text style={styles.sourceLabel} numberOfLines={2}>
              {railLabel}
            </Text>
          </View>
          {canChangeRail ? (
            <ChevronDown size={16} color={colors.text.secondary} strokeWidth={2} />
          ) : null}
        </Pressable>
      </View>

      <Pressable
        android_ripple={ripple.neutral}
        style={[styles.continueButton, (!canContinue || isContinueLoading) && styles.continueButtonDisabled]}
        onPress={onContinue}
        disabled={!canContinue || isContinueLoading}
      >
        <LinearGradient
          colors={
            !canContinue || isContinueLoading
              ? [colors.neutral[400], colors.neutral[400]]
              : colors.primary.gradient
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.continueButtonGradient}
        >
          {isContinueLoading ? (
            <ActivityIndicator color={colors.text.inverse} size="small" />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing[5],
  },
  section: {
    gap: spacing[2],
  },
  fieldLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
  },
  destinationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 56,
    gap: spacing[3],
  },
  destinationToLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
    flexShrink: 0,
  },
  destinationFlag: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  destinationText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    flex: 1,
    minWidth: 0,
  },
  amountLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    minHeight: 20,
  },
  amountLabelRowTall: {
    minHeight: 40,
  },
  exchangeHeaderSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  exchangeHeaderSpacer: {
    width: 1,
    height: 14,
    opacity: 0,
  },
  exchangeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    maxWidth: '100%',
  },
  exchangeInfoText: {
    ...textStyles.caption,
    color: colors.primary.main,
    fontFamily: fontFamily.medium,
    flexShrink: 1,
  },
  exchangeError: {
    ...textStyles.caption,
    color: colors.error.main,
    textAlign: 'right',
    flexShrink: 1,
  },
  amountInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    borderWidth: 2,
    borderColor: colors.border.light,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[6],
    gap: spacing[1],
  },
  amountSymbol: {
    fontSize: 48,
    lineHeight: 52,
    fontFamily: fontFamily.black,
    color: colors.text.primary,
    flexShrink: 0,
  },
  amountTextInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 48,
    lineHeight: 52,
    fontFamily: fontFamily.black,
    color: colors.text.primary,
    padding: 0,
    margin: 0,
    ...Platform.select({
      web: { outlineStyle: 'none' as const },
      default: {},
    }),
  },
  sourceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 52,
  },
  sourceSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
    minWidth: 0,
  },
  sourceFlag: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  sourceLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    flex: 1,
  },
  continueButton: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginTop: spacing[1],
  },
  continueButtonDisabled: {
    opacity: 0.85,
  },
  continueButtonGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    minHeight: 48,
  },
  continueButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    color: '#fff',
  },
})
