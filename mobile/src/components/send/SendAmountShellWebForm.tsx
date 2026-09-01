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
import {
  MessageSquareText,
  ChevronDown,
  Link,
  ArrowUpDown,
  User,
  RotateCcw,
} from 'lucide-react-native'
import Svg, { Path } from 'react-native-svg'
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
import { getCurrencySymbol } from '../../utils/formatters'
import { getSendAmountFieldSymbol } from '../../lib/sendAmountFieldSymbol'
import { formatMoneyDisplay, formatSendRateLabel, isWideSendAmountSymbol, scaleSendAmountPrefixFontSize, scaleSendAmountPrefixLineHeight, SEND_AMOUNT_CONTINUE_CTA, customerFacingSendAmountError, insufficientSourceBalanceDetail } from '@easner/shared'
import type { Recipient } from '../../types'
import type { HydratedEasenetProfile } from '../../hooks/useEasenetRecipientHydration'
import { SendSelectedRecipientSummary } from './SendSelectedRecipientSummary'

function LandmarkIcon({ size = 20, color = colors.text.primary }: { size?: number; color?: string }) {
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

export type SendAmountShellWebFormProps = {
  recipient: Recipient | null
  easenetPreview?: HydratedEasenetProfile | null
  showPayoutCorridorWarning?: boolean
  onRecipientPress: () => void
  amountEntryMode: 'receive' | 'send'
  sendAmount: string
  sendCurrency: string
  receiveCurrency: string
  sendingAmount: number
  receiveAmount: number
  exchangeRate: number
  showCrossCurrencyExchangeUi: boolean
  showFeeInclusiveSendingUi?: boolean
  exchangePreviewReady: boolean
  showExchangePreviewSkeleton: boolean
  needsNoahRateForSend: boolean
  needsCryptoRateForSend: boolean
  noahRatesLoading: boolean
  providerPayoutRateLoading?: boolean
  cryptoRatesLoading: boolean
  manualQuoteLoading: boolean
  /** Provider-aware send preview (Grid/YC/Noah). Prefer over legacy Noah-only flag. */
  hasSendPreviewRateForPair: boolean
  hasValidCryptoRateForPair: boolean
  selectedPaymentMethod: 'balance' | 'linkBank' | 'virtualBank' | 'otherCurrency'
  selectedBalanceCurrency: string
  selectedOtherCurrency: string | null
  selectedOtherPaymentMethod: string | null
  currencyPaymentMethods: Record<
    string,
    Array<{ code: string; name: string; type?: string; displayLogoUrl?: string | null }>
  >
  sourceDisplayLabel: string
  hasInsufficientBalance: boolean
  shortfallAmount: number
  isWalletRecipient: boolean
  amountFieldMode: string
  noteFieldUi: { label: string; placeholder: string }
  note: string
  paymentPurpose: string
  amountFieldError: string | null
  globalBankingOk: boolean
  sendButtonDisabled: boolean
  isContinueLoading?: boolean
  onAmountChange: (text: string) => void
  onToggleAmountDirection: () => void
  onOpenPaymentMethodPicker: () => void
  onOpenPurposePicker: () => void
  onNoteChange: (text: string) => void
  onVerifyPress: () => void
  onContinue: () => void
}

export function SendAmountShellWebForm({
  recipient,
  easenetPreview,
  showPayoutCorridorWarning = false,
  onRecipientPress,
  amountEntryMode,
  sendAmount,
  sendCurrency,
  receiveCurrency,
  sendingAmount,
  receiveAmount,
  exchangeRate,
  showCrossCurrencyExchangeUi,
  showFeeInclusiveSendingUi = false,
  exchangePreviewReady,
  showExchangePreviewSkeleton,
  needsNoahRateForSend,
  needsCryptoRateForSend,
  noahRatesLoading,
  providerPayoutRateLoading = false,
  cryptoRatesLoading,
  manualQuoteLoading,
  hasSendPreviewRateForPair,
  hasValidCryptoRateForPair,
  selectedPaymentMethod,
  selectedBalanceCurrency,
  selectedOtherCurrency,
  selectedOtherPaymentMethod,
  currencyPaymentMethods,
  sourceDisplayLabel,
  hasInsufficientBalance,
  shortfallAmount,
  isWalletRecipient,
  amountFieldMode,
  noteFieldUi,
  note,
  paymentPurpose,
  amountFieldError,
  globalBankingOk,
  sendButtonDisabled,
  isContinueLoading = false,
  onAmountChange,
  onToggleAmountDirection,
  onOpenPaymentMethodPicker,
  onOpenPurposePicker,
  onNoteChange,
  onVerifyPress,
  onContinue,
}: SendAmountShellWebFormProps) {
  const amountInputCurrency = amountEntryMode === 'receive' ? receiveCurrency : sendCurrency
  const amountSymbol = getSendAmountFieldSymbol(amountInputCurrency)
  const wideAmountSymbol = isWideSendAmountSymbol(amountSymbol)
  const amountSymbolStyle = wideAmountSymbol
    ? {
        fontSize: scaleSendAmountPrefixFontSize(48, amountSymbol),
        lineHeight: scaleSendAmountPrefixLineHeight(52, amountSymbol),
      }
    : null
  const showExchangeHeader = showCrossCurrencyExchangeUi

  const continueLabel = selectedPaymentMethod ? SEND_AMOUNT_CONTINUE_CTA : 'Select Method'

  const renderExchangeHeader = () => {
    if (!showExchangeHeader) {
      if (showFeeInclusiveSendingUi && sendingAmount > 0) {
        return (
          <Text style={styles.exchangeInfoText} numberOfLines={1}>
            {amountEntryMode === 'receive'
              ? `Sending: ${formatMoneyDisplay(sendingAmount, sendCurrency)}`
              : `Receiving: ${formatMoneyDisplay(receiveAmount, receiveCurrency)}`}
          </Text>
        )
      }
      return <View style={styles.exchangeHeaderSpacer} />
    }
    if (showExchangePreviewSkeleton || manualQuoteLoading) {
      return <SkeletonLoader width={200} height={14} borderRadius={7} />
    }
    if (needsCryptoRateForSend && cryptoRatesLoading) {
      return <SkeletonLoader width={200} height={14} borderRadius={7} />
    }
    if (needsNoahRateForSend && (noahRatesLoading || providerPayoutRateLoading)) {
      return <SkeletonLoader width={200} height={14} borderRadius={7} />
    }
    if (needsCryptoRateForSend && !hasValidCryptoRateForPair) {
      return (
        <Text style={styles.exchangeError} numberOfLines={2}>
          Exchange rate unavailable. Try again shortly.
        </Text>
      )
    }
    if (needsNoahRateForSend && !hasSendPreviewRateForPair) {
      return (
        <Text style={styles.exchangeError} numberOfLines={2}>
          Exchange rate unavailable. Try again shortly.
        </Text>
      )
    }
    if (exchangePreviewReady) {
      return (
        <Pressable
          android_ripple={ripple.neutral}
          onPress={onToggleAmountDirection}
          style={styles.exchangeToggleRow}
        >
          <ArrowUpDown size={14} color={colors.primary.main} strokeWidth={2.5} />
          <Text style={styles.exchangeInfoText} numberOfLines={1}>
            {amountEntryMode === 'receive'
              ? `Sending: ${formatMoneyDisplay(
                  sendingAmount,
                  selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency
                    ? selectedOtherCurrency
                    : sendCurrency,
                )}`
              : `Receiving: ${formatMoneyDisplay(receiveAmount, receiveCurrency)}`}
            {' • '}
            {`Rate: ${formatSendRateLabel(sendCurrency, receiveCurrency, exchangeRate)}`}
          </Text>
        </Pressable>
      )
    }
    return <View style={styles.exchangeHeaderSpacer} />
  }

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Recipient</Text>
        {recipient ? (
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.recipientSelector}
            onPress={onRecipientPress}
          >
            <Text style={styles.recipientToLabel}>To:</Text>
            <View style={styles.recipientSummaryWrap}>
              <SendSelectedRecipientSummary recipient={recipient} easenetPreview={easenetPreview} />
            </View>
            <RotateCcw
              size={17}
              color={colors.text.primary}
              strokeWidth={2}
              accessibilityLabel="Change recipient"
            />
          </Pressable>
        ) : (
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.recipientSelectorEmpty}
            onPress={onRecipientPress}
          >
            <View style={styles.recipientEmptyIcon}>
              <User size={20} color={colors.text.secondary} strokeWidth={2} />
            </View>
            <Text style={styles.recipientEmptyText}>Select Recipient</Text>
            <ChevronDown size={16} color={colors.text.secondary} strokeWidth={2} />
          </Pressable>
        )}
        {showPayoutCorridorWarning ? (
          <View style={styles.recipientWarning}>
            <Text style={styles.recipientWarningText}>
              Fiat payouts to this recipient are not available on your account yet for this corridor.
              Choose another recipient or try again later.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={[styles.amountLabelRow, showExchangeHeader && styles.amountLabelRowTall]}>
          <Text style={styles.fieldLabel}>
            Amount ({amountEntryMode === 'receive' ? receiveCurrency : sendCurrency})
          </Text>
          <View style={styles.exchangeHeaderSlot}>{renderExchangeHeader()}</View>
        </View>

        <View style={styles.amountInputBox}>
          <Text style={[styles.amountSymbol, amountSymbolStyle]}>{amountSymbol}</Text>
          <TextInput
            style={styles.amountTextInput}
            value={sendAmount === '0' ? '' : sendAmount}
            onChangeText={onAmountChange}
            placeholder="0.00"
            placeholderTextColor={colors.text.tertiary}
            keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
            inputMode="decimal"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            accessibilityLabel={`Amount ${amountSymbol}${sendAmount}`}
          />
        </View>

        {hasInsufficientBalance ? (
          <Text style={styles.insufficientText}>
            {insufficientSourceBalanceDetail(
              selectedBalanceCurrency,
              shortfallAmount,
              `${getCurrencySymbol(selectedBalanceCurrency)}${shortfallAmount.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`,
            )}
          </Text>
        ) : amountFieldError ? (
          <Text style={styles.insufficientText}>
            {customerFacingSendAmountError(amountFieldError, selectedBalanceCurrency) ?? amountFieldError}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Sending from</Text>
        <Pressable
          android_ripple={ripple.neutral}
          onPress={onOpenPaymentMethodPicker}
          style={[
            styles.sourceSelector,
            selectedPaymentMethod === 'balance' &&
              hasInsufficientBalance &&
              styles.sourceSelectorInsufficient,
          ]}
        >
          <View style={styles.sourceSelectorLeft}>
            <View style={styles.sourceIconWrap}>
              {selectedPaymentMethod === 'balance' ? (
                <CurrencyFlag currency={selectedBalanceCurrency} size={22} style={styles.sourceFlag} />
              ) : selectedPaymentMethod === 'linkBank' ? (
                <Link size={20} color={colors.text.primary} strokeWidth={2} />
              ) : selectedPaymentMethod === 'virtualBank' ? (
                <LandmarkIcon size={20} color={colors.text.primary} />
              ) : selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency ? (
                <CurrencyFlag currency={selectedOtherCurrency} size={22} style={styles.sourceFlag} />
              ) : (
                <LandmarkIcon size={20} color={colors.text.secondary} />
              )}
            </View>
            <Text
              style={[
                styles.sourceLabel,
                selectedPaymentMethod === 'balance' &&
                  hasInsufficientBalance &&
                  styles.sourceLabelInsufficient,
              ]}
              numberOfLines={2}
            >
              {sourceDisplayLabel}
            </Text>
          </View>
          <ChevronDown size={16} color={colors.text.secondary} strokeWidth={2} />
        </Pressable>
      </View>

      {!isWalletRecipient && amountFieldMode === 'payment_purpose' ? (
        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Payment purpose</Text>
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.formField}
            onPress={onOpenPurposePicker}
          >
            <Text
              style={[styles.formFieldText, !paymentPurpose && styles.formFieldPlaceholder]}
              numberOfLines={1}
            >
              {paymentPurpose || 'Select purpose'}
            </Text>
            <ChevronDown size={16} color={colors.text.secondary} strokeWidth={2} />
          </Pressable>
        </View>
      ) : !isWalletRecipient ? (
        <View style={styles.section}>
          <Text style={styles.fieldLabel}>{noteFieldUi.label}</Text>
          <View style={styles.formField}>
            <MessageSquareText size={18} color={colors.text.secondary} strokeWidth={2} />
            <TextInput
              style={styles.noteInput}
              placeholder={noteFieldUi.placeholder}
              placeholderTextColor={colors.text.secondary}
              value={note}
              onChangeText={onNoteChange}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>
        </View>
      ) : null}

      {!globalBankingOk ? (
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.verifyInlineCta}
          onPress={onVerifyPress}
          accessibilityRole="button"
          accessibilityLabel="Verify identity to unlock banking. Begin."
        >
          <Text style={styles.verifyInlineText}>Verify identity to unlock banking</Text>
          <Text style={styles.verifyInlineLink}>Begin</Text>
        </Pressable>
      ) : null}

      <Pressable
        android_ripple={ripple.neutral}
        style={[styles.sendButton, sendButtonDisabled && styles.sendButtonDisabled]}
        onPress={onContinue}
        disabled={sendButtonDisabled}
      >
        <LinearGradient
          colors={
            sendButtonDisabled
              ? [colors.neutral[400], colors.neutral[400]]
              : colors.primary.gradient
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.sendButtonGradient}
        >
          {isContinueLoading ? (
            <ActivityIndicator color={colors.text.inverse} size="small" />
          ) : (
            <Text style={styles.sendButtonText}>{continueLabel}</Text>
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
  recipientSelector: {
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
  recipientSelectorEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 52,
    gap: spacing[3],
  },
  recipientToLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
    flexShrink: 0,
  },
  recipientSummaryWrap: {
    flex: 1,
    minWidth: 0,
  },
  recipientEmptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
  },
  recipientEmptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
    flex: 1,
  },
  recipientWarning: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.warning.background,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  recipientWarningText: {
    ...textStyles.bodySmall,
    color: colors.warning.dark,
    lineHeight: 20,
  },
  fieldLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
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
    gap: spacing[2],
  },
  amountSymbol: {
    fontSize: 48,
    lineHeight: 52,
    fontFamily: fontFamily.black,
    color: colors.text.primary,
    flexShrink: 0,
    minWidth: 0,
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
  insufficientBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.error.background,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  insufficientText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    flex: 1,
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
  sourceSelectorInsufficient: {
    borderColor: colors.error.main,
  },
  sourceSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
    minWidth: 0,
  },
  sourceIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
  sourceLabelInsufficient: {
    color: colors.error.main,
  },
  formField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[4],
    minHeight: 44,
    gap: spacing[2],
  },
  formFieldText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    flex: 1,
  },
  formFieldPlaceholder: {
    color: colors.text.secondary,
  },
  noteInput: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    paddingVertical: spacing[2],
    ...Platform.select({
      web: { outlineStyle: 'none' as const },
      default: {},
    }),
  },
  fieldError: {
    ...textStyles.caption,
    color: colors.error.main,
  },
  verifyInlineCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing[1],
    alignSelf: 'center',
    maxWidth: '100%',
  },
  verifyInlineText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  verifyInlineLink: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    textDecorationLine: 'underline',
  },
  sendButton: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginTop: spacing[1],
  },
  sendButtonDisabled: {
    opacity: 0.85,
  },
  sendButtonGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    minHeight: 48,
  },
  sendButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    color: '#fff',
  },
})
