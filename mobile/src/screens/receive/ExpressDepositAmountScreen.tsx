import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { ArrowUpDown, Delete } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  EXPRESS_DEPOSITS_COPY,
  EXPRESS_DEPOSITS_MIN_USD_CREDIT,
  expressDepositMethodTitle,
  expressDepositsQuoteMatchesEntered,
  expressDepositsShowAmountToggle,
  formatMoneyDisplay,
  formatSendRateLabel,
  isExpressCashKind,
  isWideSendAmountSymbol,
  nextExpressDepositStep,
  resolveExpressDepositsPayCurrency,
  scaleSendAmountPrefixFontSize,
  scaleSendAmountPrefixLineHeight,
  useExpressDepositsAmountLimits,
  validateExpressDepositsAmount,
  type ExpressCashKind,
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
import { haptics } from '../../lib/haptics'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { formatKeypadAmount } from '../../components/receive/AmountKeypad'
import { useBalance } from '../../contexts/BalanceContext'
import { getCurrencySymbol } from '../../utils/formatters'
import { getSendAmountFieldSymbol } from '../../lib/sendAmountFieldSymbol'
import { buildDynamicAmountTextStyle, getDynamicAmountFontSize } from '../../lib/dynamicAmountFontSize'
import SkeletonLoader from '../../components/SkeletonLoader'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { CenteredWebFlowPage } from '../../components/layout/CenteredWebFlowPage'
import { ExpressDepositAmountShellWebForm } from '../../components/receive/ExpressDepositAmountShellWebForm'
import { ExpressMethodLogo } from '../../components/receive/ExpressMethodLogo'
import { ReceiveFlowHeader } from '../../components/receive/ReceiveFlowHeader'
import { useStackHardwareBack } from '../../hooks/useStackHardwareBack'
import { navigateStackBack } from '../../navigation/stackBackNavigation'
import { useExpressOnrampStatus } from '../../hooks/useExpressOnrampStatus'
import { fetchExpressDepositQuote, peekExpressDepositQuote } from '../../lib/expressDepositCheckout'

function readMethod(params: unknown): ExpressCashKind {
  const method = (params as { method?: string } | undefined)?.method
  return method && isExpressCashKind(method) ? method : 'express_card'
}

export default function ExpressDepositAmountScreen({ navigation, route }: NavigationProps) {
  const method = readMethod(route.params)
  const methodTitle = expressDepositMethodTitle(method)
  const { isWeb, mode } = useResponsiveLayout()
  const useWebShellLayout = isWeb && (mode === 'tablet' || mode === 'desktop')
  const { width: windowWidth } = useWindowDimensions()
  const footerPadding = useFixedFooterPadding(spacing[4])
  const keypadSizing = computeKeypadCellSize(getContentWidth(windowWidth, spacing[5]), {
    gap: spacing[2],
    minSize: 90,
    maxSize: 114,
  })
  const { balances } = useBalance()
  const usdBalance = parseFloat(balances.USD || '0')

  const { ready, loaded, paymentMethods, sourceCurrency: statusSourceCurrency, payerCountry } =
    useExpressOnrampStatus({ refreshOnFocus: true })
  const [amountEntryMode, setAmountEntryMode] = useState<'usd' | 'pay'>('usd')
  const [amountStr, setAmountStr] = useState(String(EXPRESS_DEPOSITS_MIN_USD_CREDIT))
  const [pricing, setPricing] = useState(() =>
    peekExpressDepositQuote(method, EXPRESS_DEPOSITS_MIN_USD_CREDIT, 'usd'),
  )
  const [quoteLoading, setQuoteLoading] = useState(
    () => !peekExpressDepositQuote(method, EXPRESS_DEPOSITS_MIN_USD_CREDIT, 'usd'),
  )
  const [quoteFailed, setQuoteFailed] = useState(false)
  const quoteSeqRef = useRef(0)
  const quoteDebouncedRef = useRef(false)

  const handleBack = useCallback(() => navigateStackBack(navigation), [navigation])
  useStackHardwareBack(handleBack)

  const enteredAmount = useMemo(() => Number.parseFloat(amountStr.replace(/,/g, '')) || 0, [amountStr])
  const amountPositive = enteredAmount > 0
  const sourceCurrency = resolveExpressDepositsPayCurrency({
    quoted: pricing?.sourceCurrency,
    status: statusSourceCurrency,
    payerCountry,
  })
  const showAmountToggle = expressDepositsShowAmountToggle(sourceCurrency)
  const livePricing = expressDepositsQuoteMatchesEntered({
    pricing,
    amountEntryMode,
    enteredAmount,
  })
    ? pricing
    : null
  const usdCredit = amountEntryMode === 'usd' ? enteredAmount : livePricing?.usdCredit ?? 0
  const youPay = amountEntryMode === 'pay' ? enteredAmount : livePricing?.totalToPay ?? null
  const amountLimit = validateExpressDepositsAmount({
    usdCredit,
    youPay,
    sourceCurrency,
    amountEntryMode,
  })
  const amountLimitMessage = amountPositive && !amountLimit.ok ? amountLimit.message : null

  useEffect(() => {
    if (!showAmountToggle && amountEntryMode !== 'usd') setAmountEntryMode('usd')
  }, [amountEntryMode, showAmountToggle])

  useExpressDepositsAmountLimits({
    enabled: ready && amountPositive,
    amountEntryMode,
    enteredAmount,
    usdCredit,
    youPay,
    sourceCurrency,
    onApplyEnteredAmount: (next) =>
      setAmountStr(formatKeypadAmount((Math.round(next * 100) / 100).toFixed(2))),
  })

  useEffect(() => {
    if (!amountPositive) {
      quoteSeqRef.current += 1
      setPricing(null)
      setQuoteLoading(false)
      setQuoteFailed(false)
      return
    }
    if (!ready || !amountLimit.ok) return

    const cachedQuote = peekExpressDepositQuote(method, enteredAmount, amountEntryMode)
    if (cachedQuote) {
      setPricing(cachedQuote)
      setQuoteLoading(false)
      setQuoteFailed(false)
    }

    const seq = ++quoteSeqRef.current
    if (!cachedQuote) {
      setQuoteLoading(true)
      setQuoteFailed(false)
    }
    const delay = cachedQuote || !quoteDebouncedRef.current ? 0 : 400
    quoteDebouncedRef.current = true
    const timer = setTimeout(() => {
      void fetchExpressDepositQuote({
        method,
        usdCredit: amountEntryMode === 'usd' ? enteredAmount : undefined,
        youPay: amountEntryMode === 'pay' ? enteredAmount : undefined,
        amountEntryMode,
      })
        .then((next) => {
          if (seq !== quoteSeqRef.current) return
          setPricing(next)
          setQuoteFailed(false)
        })
        .catch(() => {
          if (seq !== quoteSeqRef.current) return
          if (!cachedQuote) {
            setPricing(null)
            setQuoteFailed(true)
          }
        })
        .finally(() => {
          if (seq === quoteSeqRef.current) setQuoteLoading(false)
        })
    }, delay)
    return () => clearTimeout(timer)
  }, [amountEntryMode, amountLimit.ok, amountPositive, enteredAmount, method, ready])

  const canContinue = !ready
    ? amountPositive && loaded
    : amountPositive && Boolean(livePricing) && amountLimit.ok && !quoteFailed

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

  const handleWebAmountChange = (text: string) => {
    const sanitized = text.replace(/[^0-9.]/g, '')
    const parts = sanitized.split('.')
    if (parts.length > 2) return
    if (parts[1]?.length > 2) return
    setAmountStr(formatKeypadAmount(sanitized || '0'))
  }

  const onContinue = () => {
    if (!canContinue || !livePricing) return
    haptics.medium()
    if (!ready) {
      navigation.navigate('ExpressDepositsSetup' as never)
      return
    }
    const params = { method, usdCredit: livePricing.usdCredit, pricing: livePricing, paymentMethods }
    const next = nextExpressDepositStep({ method, paymentMethods })
    if (next === 'setup') {
      navigation.navigate('ExpressDepositPaymentSetup' as never, params as never)
      return
    }
    navigation.navigate('ExpressDepositReview' as never, params as never)
  }

  const toSwitchInputAmount = (amount: number): string => {
    const roundedAmount = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100
    const fractionalPart = Math.abs(roundedAmount - Math.trunc(roundedAmount))
    return fractionalPart >= 0.01 ? roundedAmount.toFixed(2) : String(Math.trunc(roundedAmount))
  }

  const toggleAmountDirection = () => {
    if (!showAmountToggle || !livePricing) return
    haptics.tap()
    if (amountEntryMode === 'usd' && livePricing.totalToPay > 0) {
      setAmountEntryMode('pay')
      setAmountStr(formatKeypadAmount(toSwitchInputAmount(livePricing.totalToPay)))
      return
    }
    if (amountEntryMode === 'pay' && livePricing.usdCredit > 0) {
      setAmountEntryMode('usd')
      setAmountStr(formatKeypadAmount(toSwitchInputAmount(livePricing.usdCredit)))
    }
  }

  const displayCurrency = amountEntryMode === 'pay' ? sourceCurrency : 'USD'
  const amountDisplaySymbol = getSendAmountFieldSymbol(displayCurrency)
  const exchangeRate = livePricing?.exchangeRate?.rate ?? 0
  const exchangePreviewReady = Boolean(livePricing && youPay != null && youPay > 0 && usdCredit > 0)
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

  const quoteUnavailable = amountPositive && quoteFailed && !quoteLoading && !livePricing

  return (
    <ScreenWrapper>
      {useWebShellLayout ? (
        <View style={styles.mainColumn}>
          <ReceiveFlowHeader title={EXPRESS_DEPOSITS_COPY.addMoneyCta} onBack={handleBack} />
          <CenteredWebFlowPage>
            <ExpressDepositAmountShellWebForm
              usdBalance={usdBalance}
              amountStr={amountStr}
              displayCurrency={displayCurrency}
              method={method}
              methodTitle={methodTitle}
              amountPositive={amountPositive}
              quoteLoading={quoteLoading}
              amountLimitMessage={amountLimitMessage}
              quoteUnavailable={quoteUnavailable}
              amountEntryMode={amountEntryMode}
              showAmountToggle={showAmountToggle}
              exchangePreviewReady={exchangePreviewReady}
              youPay={youPay}
              usdCredit={usdCredit}
              sourceCurrency={sourceCurrency}
              exchangeRate={exchangeRate}
              canContinue={canContinue}
              isContinueLoading={false}
              onAmountChange={handleWebAmountChange}
              onToggleAmountDirection={toggleAmountDirection}
              onContinue={onContinue}
            />
          </CenteredWebFlowPage>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.mainColumn} behavior="padding">
          <ReceiveFlowHeader title={EXPRESS_DEPOSITS_COPY.addMoneyCta} onBack={handleBack} />

          <View style={styles.content}>
            <View style={styles.formTop}>
              <View style={styles.creditBar}>
                <Text style={styles.creditLabel}>To:</Text>
                <View style={styles.flagContainer}>
                  <CurrencyFlag currency="USD" size={24} style={styles.flagImage} />
                </View>
                <Text style={styles.creditText} numberOfLines={1}>
                  USD Balance • {getCurrencySymbol('USD')}
                  {usdBalance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
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
                    <Text style={[styles.exchangeInfoText, styles.exchangeInfoPlaceholder]}> </Text>
                  ) : quoteLoading ? (
                    <SkeletonLoader width={220} height={14} borderRadius={7} />
                  ) : amountLimitMessage ? (
                    <Text style={[styles.exchangeInfoText, styles.exchangeInfoUnavailable]}>
                      {amountLimitMessage}
                    </Text>
                  ) : quoteUnavailable ? (
                    <Text style={[styles.exchangeInfoText, styles.exchangeInfoUnavailable]}>
                      Quote unavailable. Try again shortly.
                    </Text>
                  ) : exchangePreviewReady && showAmountToggle ? (
                    <View style={styles.exchangeInfoInline}>
                      <Pressable
                        android_ripple={ripple.neutral}
                        onPress={toggleAmountDirection}
                        style={styles.exchangeToggleTouchArea}
                      >
                        <ArrowUpDown size={13} color={colors.primary.main} strokeWidth={2.5} />
                        <Text style={styles.exchangeInfoText}>
                          {amountEntryMode === 'usd'
                            ? `Paying: ${formatMoneyDisplay(youPay ?? 0, sourceCurrency)}`
                            : `Receiving: ${formatMoneyDisplay(usdCredit, 'USD')}`}
                        </Text>
                      </Pressable>
                      {exchangeRate > 0 ? (
                        <Text style={styles.exchangeInfoText}>
                          {' • '}
                          {`Rate: ${formatSendRateLabel('USD', sourceCurrency, exchangeRate)}`}
                        </Text>
                      ) : null}
                    </View>
                  ) : youPay != null && youPay > 0 ? (
                    <Text style={styles.exchangeInfoText}>
                      Paying: {formatMoneyDisplay(youPay, sourceCurrency)}
                    </Text>
                  ) : (
                    <Text style={[styles.exchangeInfoText, styles.exchangeInfoPlaceholder]}> </Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.methodKeypadFill}>
              <View style={styles.methodKeypadGroup}>
                <View style={styles.balanceSection}>
                  <View style={styles.balanceSelector}>
                    <ExpressMethodLogo kind={method} size={24} />
                    <Text style={styles.balanceSelectorText} numberOfLines={1}>
                      {methodTitle}
                    </Text>
                  </View>
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
              style={[styles.sendButton, !canContinue && styles.sendButtonDisabled]}
              onPress={onContinue}
              disabled={!canContinue}
            >
              <LinearGradient
                colors={!canContinue ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sendButtonGradient}
              >
                <Text style={styles.sendButtonText}>{EXPRESS_DEPOSITS_COPY.continueCta}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  mainColumn: { flex: 1 },
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
