import React from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import {
  AlertCircle,
  ArrowUpDown,
  ChevronDown,
  Coins,
  Landmark,
  Link,
  MessageSquareText,
} from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import SkeletonLoader from '../SkeletonLoader'
import { CachedImage } from '../CachedImage'
import { CurrencyFlag } from '../flags/CurrencyFlag'
import { SendSelectedRecipientSummary } from './SendSelectedRecipientSummary'
import type { Recipient } from '../../types'
import type { HydratedEasenetProfile } from '../../hooks/useEasenetRecipientHydration'
import { colors, textStyles, spacing, borderRadius, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { formatSendRateLabel, formatMoneyDisplay } from '@easner/shared'
import { getSendAmountFieldSymbol } from '../../lib/sendAmountFieldSymbol'
import { getCurrencySymbol } from '../../utils/formatters'
import { getTokenIconUrl } from '../../lib/cryptoIcons'
import Svg, { Path } from 'react-native-svg'

const WEB_FORM_MAX_WIDTH = 672

function LandmarkIcon({ size = 20, color = colors.text.secondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10 18v-7" />
      <Path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z" />
      <Path d="M14 18v-7" />
      <Path d="M18 18v-7" />
      <Path d="M3 22h18" />
      <Path d="M6 18v-7" />
    </Svg>
  )
}

function isManualStablecoinCurrencyCode(code: string): boolean {
  const c = code.trim().toUpperCase()
  return c === 'USDC' || c === 'USDT' || c === 'STABLE'
}

export type SendAmountWebShellViewProps = {
  recipient: Recipient | null
  easenetPreview?: HydratedEasenetProfile | null
  onOpenRecipientPicker: () => void
  sendAmount: string
  onAmountChange: (value: string) => void
  amountEntryMode: 'receive' | 'send'
  amountInputCurrency: string
  receiveCurrency: string
  sendCurrency: string
  showCrossCurrencyExchangeUi: boolean
  exchangePreviewReady: boolean
  showExchangePreviewSkeleton: boolean
  sendingAmount: number
  receiveAmount: number
  exchangeRate: number
  onToggleAmountDirection: () => void
  needsNoahRateForSend: boolean
  needsCryptoRateForSend: boolean
  noahRatesLoading: boolean
  cryptoRatesLoading: boolean
  hasNoahRateForPair: boolean
  hasValidCryptoRateForPair: boolean
  manualQuoteLoading: boolean
  manualQuoteEnabled: boolean
  selectedPaymentMethod: 'balance' | 'linkBank' | 'virtualBank' | 'otherCurrency'
  selectedBalanceCurrency: string
  selectedOtherCurrency: string | null
  selectedOtherPaymentMethod: string | null
  currencyPaymentMethods: Record<string, Array<{ code: string; name: string; displayLogoUrl?: string | null }>>
  sourceDisplayLabel: string
  sourceBalanceNegative: boolean
  onOpenSourcePicker: () => void
  hasInsufficientBalance: boolean
  shortfallAmount: number
  shortfallCurrency: string
  isWalletRecipient: boolean
  amountFieldMode: string
  noteFieldUi: { label: string; placeholder: string }
  note: string
  onNoteChange: (value: string) => void
  paymentPurpose: string
  onOpenPurposePicker: () => void
  amountFieldError: string | null
  showPayoutCorridorWarning: boolean
  tier1Ok: boolean
  onVerifyIdentity: () => void
  sendButtonDisabled: boolean
  continueLabel: string
  onContinue: () => void
}

export function SendAmountWebShellView({
  recipient,
  easenetPreview,
  onOpenRecipientPicker,
  sendAmount,
  onAmountChange,
  amountEntryMode,
  amountInputCurrency,
  receiveCurrency,
  sendCurrency,
  showCrossCurrencyExchangeUi,
  exchangePreviewReady,
  showExchangePreviewSkeleton,
  sendingAmount,
  receiveAmount,
  exchangeRate,
  onToggleAmountDirection,
  needsNoahRateForSend,
  needsCryptoRateForSend,
  noahRatesLoading,
  cryptoRatesLoading,
  hasNoahRateForPair,
  hasValidCryptoRateForPair,
  manualQuoteLoading,
  manualQuoteEnabled,
  selectedPaymentMethod,
  selectedBalanceCurrency,
  selectedOtherCurrency,
  selectedOtherPaymentMethod,
  currencyPaymentMethods,
  sourceDisplayLabel,
  sourceBalanceNegative,
  onOpenSourcePicker,
  hasInsufficientBalance,
  shortfallAmount,
  shortfallCurrency,
  isWalletRecipient,
  amountFieldMode,
  noteFieldUi,
  note,
  onNoteChange,
  paymentPurpose,
  onOpenPurposePicker,
  amountFieldError,
  showPayoutCorridorWarning,
  tier1Ok,
  onVerifyIdentity,
  sendButtonDisabled,
  continueLabel,
  onContinue,
}: SendAmountWebShellViewProps) {
  const amountSymbol = getSendAmountFieldSymbol(amountInputCurrency)
  const hasFx = showCrossCurrencyExchangeUi && exchangePreviewReady && exchangeRate > 0
  const toggleAmount = amountEntryMode === 'receive' ? sendingAmount : receiveAmount
  const toggleCurrency = amountEntryMode === 'receive' ? sendCurrency : receiveCurrency

  const renderExchangeMeta = () => {
    if (!recipient || !showCrossCurrencyExchangeUi) return null
    if (showExchangePreviewSkeleton || manualQuoteLoading) {
      return <SkeletonLoader width={220} height={14} borderRadius={7} />
    }
    if (manualQuoteEnabled && !exchangePreviewReady) {
      return (
        <Text style={styles.exchangeError} numberOfLines={2}>
          Exchange rate unavailable. Try again shortly.
        </Text>
      )
    }
    if (needsNoahRateForSend && noahRatesLoading) {
      return <SkeletonLoader width={220} height={14} borderRadius={7} />
    }
    if (needsCryptoRateForSend && cryptoRatesLoading) {
      return <SkeletonLoader width={220} height={14} borderRadius={7} />
    }
    if (needsNoahRateForSend && !hasNoahRateForPair) {
      return <Text style={styles.exchangeError}>Exchange rate unavailable. Try again shortly.</Text>
    }
    if (needsCryptoRateForSend && !hasValidCryptoRateForPair) {
      return <Text style={styles.exchangeError}>Exchange rate unavailable. Try again shortly.</Text>
    }
    if (!hasFx) return <Text style={styles.exchangePlaceholder}>.</Text>
    return (
      <View style={styles.exchangeMetaRow}>
        <Pressable android_ripple={ripple.neutral} style={styles.exchangeToggle} onPress={onToggleAmountDirection}>
          <ArrowUpDown size={14} color={colors.primary.main} strokeWidth={2} />
          <Text style={styles.exchangeMetaText} numberOfLines={1}>
            {amountEntryMode === 'receive' ? 'Sending' : 'Receiving'}:{' '}
            {formatMoneyDisplay(toggleAmount, toggleCurrency)}
          </Text>
        </Pressable>
        <Text style={styles.exchangeMetaText} numberOfLines={1}>
          {' • Rate: '}
          {formatSendRateLabel(sendCurrency, receiveCurrency, exchangeRate)}
        </Text>
      </View>
    )
  }

  const renderSourceIcon = () => {
    if (selectedPaymentMethod === 'balance') {
      return <CurrencyFlag currency={selectedBalanceCurrency} size={22} />
    }
    if (selectedPaymentMethod === 'linkBank') {
      return <Link size={20} color={colors.text.secondary} strokeWidth={2} />
    }
    if (selectedPaymentMethod === 'virtualBank') {
      return <LandmarkIcon />
    }
    if (selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency) {
      if (isManualStablecoinCurrencyCode(selectedOtherCurrency)) {
        const iconUrl = getTokenIconUrl(selectedOtherCurrency)
        return iconUrl ? (
          <CachedImage uri={iconUrl} style={styles.sourceIconImage} contentFit="cover" />
        ) : (
          <Coins size={20} color={colors.text.secondary} strokeWidth={2} />
        )
      }
      return <CurrencyFlag currency={selectedOtherCurrency} size={22} />
    }
    return <LandmarkIcon />
  }

  return (
    <View style={styles.root}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Send money</Text>
        <Text style={styles.pageSubtitle}>Select recipient, amount, and how you'd like to send</Text>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Recipient</Text>
        <Pressable android_ripple={ripple.neutral} style={styles.selectorButton} onPress={onOpenRecipientPicker}>
          {recipient ? (
            <SendSelectedRecipientSummary recipient={recipient} easenetPreview={easenetPreview} />
          ) : (
            <Text style={styles.selectorPlaceholder}>Select recipient</Text>
          )}
          <ChevronDown size={16} color={colors.text.secondary} strokeWidth={2} />
        </Pressable>
      </View>

      {showPayoutCorridorWarning ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Fiat payouts to this recipient are not available on your account yet (Noah sell channel missing).
            Choose another recipient or a US/EUR bank corridor.
          </Text>
        </View>
      ) : null}

      {recipient ? (
        <View style={styles.fieldGroup}>
          <View style={[styles.amountLabelRow, showCrossCurrencyExchangeUi && styles.amountLabelRowTall]}>
            <Text style={styles.fieldLabel}>
              Amount ({amountEntryMode === 'receive' ? receiveCurrency : sendCurrency})
            </Text>
            <View style={styles.exchangeMetaSlot}>{renderExchangeMeta()}</View>
          </View>

          <View style={styles.amountInputBox}>
            <Text style={styles.amountSymbol}>{amountSymbol}</Text>
            <TextInput
              style={styles.amountInput}
              value={sendAmount === '0' ? '' : sendAmount}
              onChangeText={onAmountChange}
              placeholder="0.00"
              placeholderTextColor={colors.text.secondary + '80'}
              keyboardType="decimal-pad"
              inputMode="decimal"
            />
          </View>

          {hasInsufficientBalance ? (
            <View style={styles.insufficientBanner}>
              <AlertCircle size={16} color={colors.semantic.destructive} strokeWidth={2} />
              <Text style={styles.insufficientText}>
                Insufficient {shortfallCurrency} balance. You need {getCurrencySymbol(shortfallCurrency)}
                {shortfallAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} more,
                or choose another source.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {recipient ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Sending from</Text>
          <Pressable android_ripple={ripple.neutral} style={styles.selectorButton} onPress={onOpenSourcePicker}>
            <View style={styles.sourceRow}>
              {renderSourceIcon()}
              <Text
                style={[styles.sourceLabel, sourceBalanceNegative && styles.sourceLabelNegative]}
                numberOfLines={2}
              >
                {sourceDisplayLabel}
              </Text>
            </View>
            <ChevronDown size={16} color={colors.text.secondary} strokeWidth={2} />
          </Pressable>
        </View>
      ) : null}

      {recipient && !isWalletRecipient && amountFieldMode === 'payment_purpose' ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Payment purpose</Text>
          <Pressable android_ripple={ripple.neutral} style={styles.textFieldButton} onPress={onOpenPurposePicker}>
            <Text style={[styles.textFieldValue, !paymentPurpose && styles.textFieldPlaceholder]} numberOfLines={1}>
              {paymentPurpose || 'Select purpose'}
            </Text>
            <ChevronDown size={16} color={colors.text.secondary} strokeWidth={2} />
          </Pressable>
          {amountFieldError ? <Text style={styles.fieldError}>{amountFieldError}</Text> : null}
        </View>
      ) : recipient && !isWalletRecipient ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{noteFieldUi.label}</Text>
          <View style={styles.noteField}>
            <MessageSquareText size={18} color={colors.text.secondary} strokeWidth={2} />
            <TextInput
              style={styles.noteInput}
              placeholder={noteFieldUi.placeholder}
              placeholderTextColor={colors.text.secondary}
              value={note}
              onChangeText={onNoteChange}
            />
          </View>
          {amountFieldError ? <Text style={styles.fieldError}>{amountFieldError}</Text> : null}
        </View>
      ) : null}

      {!tier1Ok ? (
        <Pressable android_ripple={ripple.neutral} style={styles.verifyCta} onPress={onVerifyIdentity}>
          <Text style={styles.verifyText}>Verify identity to unlock banking</Text>
          <Text style={styles.verifyLink}>Begin</Text>
        </Pressable>
      ) : null}

      <Pressable
        android_ripple={ripple.neutral}
        style={[styles.continueButton, sendButtonDisabled && styles.continueButtonDisabled]}
        onPress={onContinue}
        disabled={sendButtonDisabled}
      >
        <LinearGradient
          colors={sendButtonDisabled ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.continueGradient}
        >
          <Text style={styles.continueText}>{continueLabel}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: WEB_FORM_MAX_WIDTH,
    alignSelf: 'center',
    gap: spacing[6],
    paddingTop: spacing[2],
  },
  pageHeader: {
    gap: spacing[1],
  },
  pageTitle: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  pageSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  fieldGroup: {
    gap: spacing[2],
  },
  fieldLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.semantic.background,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 52,
  },
  selectorPlaceholder: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    flex: 1,
  },
  warningBanner: {
    backgroundColor: colors.warning.background,
    borderRadius: borderRadius.md,
    padding: spacing[3],
  },
  warningText: {
    ...textStyles.bodySmall,
    color: colors.warning.dark,
    lineHeight: 20,
  },
  amountLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  amountLabelRowTall: {
    minHeight: 40,
  },
  exchangeMetaSlot: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0,
  },
  exchangeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[1],
    maxWidth: '100%',
  },
  exchangeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    maxWidth: '100%',
  },
  exchangeMetaText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
  },
  exchangeError: {
    ...textStyles.bodySmall,
    color: colors.semantic.destructive,
    textAlign: 'right',
  },
  exchangePlaceholder: {
    opacity: 0,
    ...textStyles.bodySmall,
  },
  amountInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    borderWidth: 2,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.semantic.background,
    paddingHorizontal: spacing[6],
    gap: spacing[1],
  },
  amountSymbol: {
    fontSize: 48,
    lineHeight: 52,
    fontFamily: fontFamily.black,
    color: colors.text.primary,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 48,
    lineHeight: 52,
    fontFamily: fontFamily.black,
    color: colors.text.primary,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    outlineStyle: 'none',
  } as object,
  insufficientBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    backgroundColor: colors.semantic.destructive + '18',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  insufficientText: {
    ...textStyles.bodySmall,
    color: colors.semantic.destructive,
    flex: 1,
    lineHeight: 20,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
    minWidth: 0,
  },
  sourceIconImage: {
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
  sourceLabelNegative: {
    color: colors.semantic.destructive,
  },
  textFieldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.semantic.background,
    paddingHorizontal: spacing[4],
    minHeight: 44,
  },
  textFieldValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    flex: 1,
  },
  textFieldPlaceholder: {
    color: colors.text.secondary,
  },
  noteField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.semantic.background,
    paddingHorizontal: spacing[4],
    minHeight: 44,
  },
  noteInput: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    flex: 1,
    paddingVertical: spacing[3],
    borderWidth: 0,
    backgroundColor: 'transparent',
    outlineStyle: 'none',
  } as object,
  fieldError: {
    ...textStyles.bodySmall,
    color: colors.semantic.destructive,
  },
  verifyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
  },
  verifyText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  verifyLink: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
  continueButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginTop: spacing[2],
  },
  continueButtonDisabled: {
    opacity: 0.7,
  },
  continueGradient: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  continueText: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
})
