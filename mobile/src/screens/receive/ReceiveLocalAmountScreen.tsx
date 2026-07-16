import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { ArrowLeft, ArrowUpDown, ChevronDown, Delete } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  formatMoneyDisplay,
  formatSendRateLabel,
  formatYcPayInMinHint,
  isWideSendAmountSymbol,
  scaleSendAmountPrefixFontSize,
  scaleSendAmountPrefixLineHeight,
  validateYcFundBalancePayInAmount,
} from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import {
  colors,
  spacing,
  textStyles,
  borderRadius,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  fontFamily,
  computeKeypadCellSize,
  getContentWidth,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useFixedFooterPadding } from '../../hooks/useScrollBottomPadding'
import { useYcFundBalanceFlow, useYcReceiveRails } from '../../hooks/useYcFundBalanceFlow'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { haptics } from '../../lib/haptics'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { formatKeypadAmount } from '../../components/receive/AmountKeypad'
import { useBalance } from '../../contexts/BalanceContext'
import { getCurrencySymbol } from '../../utils/formatters'
import { getSendAmountFieldSymbol } from '../../lib/sendAmountFieldSymbol'
import { buildDynamicAmountTextStyle, getDynamicAmountFontSize } from '../../lib/dynamicAmountFontSize'
import type { NgLocalIdType } from '@easner/shared'
import { NgLocalVerificationNotice } from '../../components/compliance/NgLocalVerificationNotice'
import SkeletonLoader from '../../components/SkeletonLoader'
import { useToast } from '../../components/ToastProvider'
import {
  clearFundBalanceQuote,
  ensureFundBalanceQuoteStashed,
  isCompleteFundBalanceQuote,
  isStashedFundBalanceQuoteFresh,
  peekFundBalanceQuote,
  peekLastFundBalanceQuoteError,
} from '../../lib/sendFlowFundBalanceQuote'

type RouteParams = {
  localPayInCurrency: string
  residenceCountry: string
  payInRail: YcPayInRail
  bankAvailable?: boolean
  momoAvailable?: boolean
  ngMissingType?: NgLocalIdType | null
}

export default function ReceiveLocalAmountScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const footerPadding = useFixedFooterPadding(spacing[4])
  const keypadSizing = computeKeypadCellSize(getContentWidth(windowWidth, spacing[5]), {
    gap: spacing[2],
    minSize: 90,
    maxSize: 114,
  })
  const { balances } = useBalance()
  const { showError } = useToast()
  const params = (route.params || {}) as Partial<RouteParams>

  const localPayInCurrency = params.localPayInCurrency ?? ''
  const residenceCountry = params.residenceCountry ?? ''
  const payInRail = params.payInRail ?? 'bank_transfer'
  const bankAvailable = params.bankAvailable ?? false
  const momoAvailable = params.momoAvailable ?? false
  const ngMissingType = params.ngMissingType ?? null

  const [amountEntryMode, setAmountEntryMode] = useState<'usd' | 'local'>('usd')
  const [amountStr, setAmountStr] = useState('0')
  const [isContinuePending, setIsContinuePending] = useState(false)
  const [isContinueLoading, setIsContinueLoading] = useState(false)
  const continueSpinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enteredAmount = useMemo(
    () => Number.parseFloat(amountStr.replace(/,/g, '')) || 0,
    [amountStr],
  )
  const amountPositive = enteredAmount > 0

  const ycFlow = useYcFundBalanceFlow({
    country: residenceCountry,
    currency: localPayInCurrency,
    rail: payInRail,
    enabled: Boolean(residenceCountry && localPayInCurrency),
    amountEntryMode,
    enteredAmount,
  })

  const { rails: receiveRails } = useYcReceiveRails({
    country: residenceCountry,
    currency: localPayInCurrency,
    enabled: Boolean(residenceCountry && localPayInCurrency),
  })

  const payInLimits = useMemo(() => {
    const railInfo =
      payInRail === 'mobile_money'
        ? receiveRails?.rails.mobile_money
        : receiveRails?.rails.bank_transfer
    return {
      minLocalPayIn: railInfo?.minLocalPayIn ?? null,
      maxLocalPayIn: railInfo?.maxLocalPayIn ?? null,
    }
  }, [receiveRails, payInRail])

  const amountLimitCheck = useMemo(() => {
    if (!amountPositive || !ycFlow.customerRate) return { ok: true as const }
    return validateYcFundBalancePayInAmount({
      amountEntryMode,
      enteredAmount,
      previewLocalPayIn: ycFlow.preview.localPayIn,
      currency: localPayInCurrency,
      limits: payInLimits,
    })
  }, [
    amountEntryMode,
    amountPositive,
    enteredAmount,
    localPayInCurrency,
    payInLimits,
    ycFlow.customerRate,
    ycFlow.preview.localPayIn,
  ])

  const minDepositHint =
    payInLimits.minLocalPayIn != null && ycFlow.customerRate
      ? formatYcPayInMinHint({
          minLocalPayIn: payInLimits.minLocalPayIn,
          currency: localPayInCurrency,
          customerSellRate: ycFlow.customerRate,
        })
      : null

  const usdBalance = parseFloat(balances.USD || '0')
  const railLabel = payInRail === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer'
  const canContinue =
    amountPositive &&
    !ycFlow.ratesLoading &&
    Boolean(ycFlow.customerRate) &&
    amountLimitCheck.ok

  const displayCurrency = amountEntryMode === 'usd' ? 'USD' : localPayInCurrency
  const amountDisplaySymbol = getSendAmountFieldSymbol(displayCurrency)
  const dynamicAmountFontSize = getDynamicAmountFontSize(amountStr)
  const dynamicAmountLineHeight = Math.round(dynamicAmountFontSize * 1.12)
  const amountTextStyle = buildDynamicAmountTextStyle(textStyles.balanceDisplay, amountStr)
  const wideAmountSymbol = isWideSendAmountSymbol(amountDisplaySymbol)
  const amountPrefixStyle = wideAmountSymbol
    ? {
        fontSize: scaleSendAmountPrefixFontSize(dynamicAmountFontSize, amountDisplaySymbol),
        lineHeight: scaleSendAmountPrefixLineHeight(dynamicAmountLineHeight, amountDisplaySymbol),
      }
    : null
  const amountRowHeight = Math.max(
    Platform.select({ ios: 108, default: 116 }) ?? 116,
    dynamicAmountLineHeight + spacing[2],
  )

  const showExchangePreviewSkeleton = amountPositive && ycFlow.ratesLoading
  const exchangePreviewReady = amountPositive && !ycFlow.ratesLoading && Boolean(ycFlow.customerRate)

  const quoteStashMeta = useMemo(
    () => ({
      country: residenceCountry,
      currency: localPayInCurrency,
      rail: payInRail,
      amountEntryMode,
      enteredAmount,
    }),
    [residenceCountry, localPayInCurrency, payInRail, amountEntryMode, enteredAmount],
  )

  const quotePrefetchKey = useMemo(() => {
    if (!canContinue) return ''
    return [
      quoteStashMeta.country,
      quoteStashMeta.currency,
      quoteStashMeta.rail,
      quoteStashMeta.amountEntryMode,
      quoteStashMeta.enteredAmount,
    ].join('|')
  }, [canContinue, quoteStashMeta])

  useEffect(() => {
    clearFundBalanceQuote()
  }, [localPayInCurrency, residenceCountry, payInRail])

  useEffect(() => {
    if (!quotePrefetchKey) return
    void ensureFundBalanceQuoteStashed(quoteStashMeta)
  }, [quotePrefetchKey, quoteStashMeta])

  const toSwitchInputAmount = (amount: number): string => {
    const roundedAmount = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100
    const fractionalPart = Math.abs(roundedAmount - Math.trunc(roundedAmount))
    return fractionalPart >= 0.01 ? roundedAmount.toFixed(2) : String(Math.trunc(roundedAmount))
  }

  const toggleAmountDirection = () => {
    haptics.tap()
    if (amountEntryMode === 'usd' && ycFlow.preview.localPayIn > 0) {
      setAmountEntryMode('local')
      setAmountStr(formatKeypadAmount(toSwitchInputAmount(ycFlow.preview.localPayIn)))
    } else if (amountEntryMode === 'local' && ycFlow.preview.usdCredit > 0) {
      setAmountEntryMode('usd')
      setAmountStr(formatKeypadAmount(toSwitchInputAmount(ycFlow.preview.usdCredit)))
    } else {
      setAmountEntryMode(amountEntryMode === 'usd' ? 'local' : 'usd')
    }
  }

  const changeRail = () => {
    if (!bankAvailable || !momoAvailable) return
    haptics.tap()
    navigation.navigate('ReceiveLocalRail' as never, {
      localPayInCurrency,
      residenceCountry,
      ngMissingType,
    } as never)
  }

  const handleKeypadPress = (value: string) => {
    haptics.tap()
    let raw = amountStr.replace(/,/g, '')

    if (value === 'backspace') {
      setAmountStr(formatKeypadAmount(raw.slice(0, -1)))
      return
    }

    if (value === '.') {
      if (raw.includes('.')) return
      setAmountStr(formatKeypadAmount(`${raw}.`))
      return
    }

    if (!/^\d$/.test(value)) return
    if (raw.includes('.')) {
      const decimals = raw.split('.')[1] ?? ''
      if (decimals.length >= 2) return
    }
    if (raw === '0') raw = value
    else raw += value
    setAmountStr(formatKeypadAmount(raw))
  }

  const onContinue = async () => {
    if (!canContinue || isContinuePending || isContinueLoading) return
    haptics.medium()

    const quoteAlreadyWarm = isStashedFundBalanceQuoteFresh(quoteStashMeta)
    if (!quoteAlreadyWarm) {
      setIsContinuePending(true)
      continueSpinnerTimerRef.current = setTimeout(() => setIsContinueLoading(true), 175)
    }

    try {
      const quote = quoteAlreadyWarm
        ? peekFundBalanceQuote()
        : await ensureFundBalanceQuoteStashed(quoteStashMeta)
      if (!isCompleteFundBalanceQuote(quote)) {
        showError(peekLastFundBalanceQuoteError() || 'Could not load deposit quote. Try again.')
        return
      }
      navigation.navigate('ReceiveLocalReview' as never, {
        localPayInCurrency,
        residenceCountry,
        payInRail,
        amountEntryMode,
        enteredAmount,
        usdCredit: ycFlow.preview.usdCredit,
        localPayIn: ycFlow.preview.localPayIn,
      } as never)
    } finally {
      if (continueSpinnerTimerRef.current) {
        clearTimeout(continueSpinnerTimerRef.current)
        continueSpinnerTimerRef.current = null
      }
      setIsContinuePending(false)
      setIsContinueLoading(false)
    }
  }

  if (ngMissingType) {
    return (
      <ScreenWrapper>
        <View style={[styles.blocked, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Pressable android_ripple={ripple.neutral} onPress={() => navigation.goBack()} style={styles.backButton}>
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
            <Text style={styles.title}>Add money</Text>
          </View>
          <NgLocalVerificationNotice missingType={ngMissingType} onSaved={() => navigation.goBack()} />
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView style={styles.mainColumn} behavior="padding">
        <View style={[styles.header, { paddingTop: spacing[4] + insets.top }]}>
          <Pressable android_ripple={ripple.neutral} onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Add money</Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.formTop}>
            <View style={styles.creditBar}>
              <Text style={styles.creditLabel}>To:</Text>
              <View style={styles.flagContainer}>
                <CurrencyFlag currency="USD" size={24} style={styles.flagImage} />
              </View>
              <Text style={styles.creditText} numberOfLines={1}>
                USD Balance • {getCurrencySymbol('USD')}
                {usdBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>

            <View style={styles.amountSection}>
              <View style={[styles.amountInputWrapper, { height: amountRowHeight }]}>
                <View style={styles.amountInputContainer}>
                  <Text
                    style={[styles.amountInput, amountTextStyle, styles.amountUnified]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}
                    accessibilityRole="text"
                    accessibilityLabel={`Amount ${amountDisplaySymbol}${amountStr}`}
                  >
                    {wideAmountSymbol && amountPrefixStyle ? (
                      <Text style={amountPrefixStyle}>{amountDisplaySymbol}</Text>
                    ) : (
                      amountDisplaySymbol
                    )}
                    {amountStr}
                  </Text>
                </View>
              </View>

              <View style={styles.exchangeInfoSlot}>
                {!amountPositive ? (
                  minDepositHint ? (
                    <Text style={styles.exchangeInfoText}>{minDepositHint}</Text>
                  ) : (
                    <Text style={[styles.exchangeInfoText, styles.exchangeInfoPlaceholder]}> </Text>
                  )
                ) : showExchangePreviewSkeleton ? (
                  <SkeletonLoader width={220} height={14} borderRadius={7} />
                ) : !amountLimitCheck.ok ? (
                  <Text style={[styles.exchangeInfoText, styles.exchangeInfoUnavailable]}>
                    {amountLimitCheck.message}
                  </Text>
                ) : exchangePreviewReady ? (
                  <View style={styles.exchangeInfoInline}>
                    <Pressable android_ripple={ripple.neutral} onPress={toggleAmountDirection} style={styles.exchangeToggleTouchArea}>
                      <ArrowUpDown size={13} color={colors.primary.main} strokeWidth={2.5} />
                      <Text style={styles.exchangeInfoText}>
                        {amountEntryMode === 'usd'
                          ? `Paying: ${formatMoneyDisplay(ycFlow.preview.localPayIn, localPayInCurrency)}`
                          : `Receiving: ${formatMoneyDisplay(ycFlow.preview.usdCredit, 'USD')}`}
                      </Text>
                    </Pressable>
                    {ycFlow.customerRate ? (
                      <Text style={styles.exchangeInfoText}>
                        {' • '}
                        {`Rate: ${formatSendRateLabel('USD', localPayInCurrency, ycFlow.customerRate)}`}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={[styles.exchangeInfoText, styles.exchangeInfoUnavailable]}>
                    Exchange rate unavailable. Try again shortly.
                  </Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.methodKeypadFill}>
            <View style={styles.methodKeypadGroup}>
              <View style={styles.balanceSection}>
                <Pressable
                  android_ripple={ripple.neutral}
                  style={styles.balanceSelector}
                  onPress={changeRail}
                  disabled={!bankAvailable || !momoAvailable}
                >
                  <View style={styles.flagContainer}>
                    <CurrencyFlag currency={localPayInCurrency} size={24} style={styles.flagImage} />
                  </View>
                  <Text style={styles.balanceSelectorText} numberOfLines={1}>
                    {localPayInCurrency} • {railLabel}
                  </Text>
                  {bankAvailable && momoAvailable ? (
                    <ChevronDown size={16} color={colors.text.primary} strokeWidth={2} />
                  ) : null}
                </Pressable>
              </View>

              <View style={styles.keypadContainer}>
                <View
                  style={[
                    styles.keypadGrid,
                    { width: keypadSizing.rowWidth, gap: keypadSizing.gap, rowGap: keypadSizing.gap },
                  ]}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <Pressable
                      android_ripple={ripple.neutral}
                      key={num}
                      style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                      onPress={() => handleKeypadPress(num.toString())}
                      onPressIn={() => haptics.tap()}
                    >
                      <Text style={styles.keypadButtonText}>{num}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                    onPress={() => handleKeypadPress('.')}
                    onPressIn={() => haptics.tap()}
                  >
                    <Text style={styles.keypadButtonText}>.</Text>
                  </Pressable>
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                    onPress={() => handleKeypadPress('0')}
                    onPressIn={() => haptics.tap()}
                  >
                    <Text style={styles.keypadButtonText}>0</Text>
                  </Pressable>
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                    onPress={() => handleKeypadPress('backspace')}
                    onPressIn={() => haptics.tap()}
                    disabled={!amountStr || amountStr === '0'}
                  >
                    <Delete
                      size={24}
                      color={!amountStr || amountStr === '0' ? colors.text.secondary : colors.text.primary}
                      strokeWidth={2}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.bottomContainer, { paddingBottom: footerPadding }]}>
          <Pressable
            android_ripple={ripple.neutral}
            style={[styles.sendButton, (!canContinue || isContinuePending || isContinueLoading) && styles.sendButtonDisabled]}
            onPress={onContinue}
            disabled={!canContinue || isContinuePending || isContinueLoading}
          >
            <LinearGradient
              colors={!canContinue || isContinuePending || isContinueLoading ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sendButtonGradient}
            >
              {isContinueLoading ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <Text style={styles.sendButtonText}>Continue</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  mainColumn: { flex: 1 },
  blocked: { flex: 1, paddingHorizontal: spacing[5] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[4],
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerContent: { flex: 1, justifyContent: 'center' },
  title: { ...textStyles.headlineMedium, color: colors.text.primary },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    flex: 1,
    justifyContent: 'flex-start',
  },
  formTop: { flexShrink: 0 },
  creditBar: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: 24 }),
    height: 56,
    width: '85%',
    alignSelf: 'center',
    paddingHorizontal: spacing[4],
    marginBottom: 25,
    gap: spacing[3],
  },
  creditLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
  creditText: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
  flagContainer: {
    ...surfaceChromeCircleStyle(colors, 24, { shadow: 'none' }),
    overflow: 'hidden',
  },
  flagImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  amountSection: {
    marginTop: 8,
    marginBottom: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  amountInputWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    width: '100%',
    paddingVertical: spacing[1],
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: '100%',
  },
  amountUnified: {
    flexShrink: 1,
    textAlign: 'center',
    maxWidth: '100%',
    width: '100%',
    ...Platform.select({
      android: { includeFontPadding: false },
      ios: { includeFontPadding: false },
      default: {},
    }),
  },
  amountInput: {
    fontSize: 50,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: fontFamily.black,
    textAlign: 'center',
    padding: 0,
    marginVertical: 0,
    flexShrink: 1,
    flexGrow: 0,
    includeFontPadding: false,
  },
  exchangeInfoSlot: {
    marginTop: 0,
    minHeight: 58,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
  },
  exchangeInfoPlaceholder: { opacity: 0 },
  exchangeInfoUnavailable: {
    color: colors.semantic.destructive,
    textAlign: 'center',
  },
  exchangeInfoInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exchangeToggleTouchArea: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    gap: 4,
  },
  exchangeInfoText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.primary.main,
    fontFamily: fontFamily.medium,
    textAlign: 'center',
  },
  methodKeypadFill: {
    flex: 1,
    justifyContent: 'flex-end',
    width: '100%',
    minHeight: 0,
  },
  methodKeypadGroup: {
    marginTop: 0,
    marginBottom: spacing[2],
    flexShrink: 0,
    width: '100%',
  },
  balanceSection: {
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 0,
  },
  balanceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: 100 }),
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginBottom: spacing[2],
    gap: spacing[2],
    minWidth: 180,
    minHeight: 48,
    justifyContent: 'center',
  },
  balanceSelectorText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
  keypadContainer: {
    width: '100%',
    paddingHorizontal: spacing[5],
    paddingTop: 0,
    paddingBottom: spacing[2],
    backgroundColor: colors.background.primary,
    alignItems: 'center',
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    width: '100%',
    gap: spacing[2],
    rowGap: spacing[2],
  },
  keypadButton: {
    width: 113,
    height: 50,
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: 20 }),
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadButtonText: {
    fontSize: 28,
    lineHeight: 34,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  bottomContainer: {
    paddingHorizontal: spacing[5],
    paddingTop: 0,
    backgroundColor: colors.background.primary,
  },
  sendButton: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginTop: spacing[2],
  },
  sendButtonDisabled: { opacity: 0.85 },
  sendButtonGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    minHeight: 52,
  },
  sendButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: colors.text.inverse,
  },
})
