import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
  Keyboard,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { MessageSquareText, ChevronDown, User, Coins, RotateCcw, ArrowLeft, ArrowUpDown, Link, Delete, X, ChevronRight } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useFixedFooterPadding } from '../../hooks/useScrollBottomPadding'
import { WebAwareModal } from '../../components/WebAwareModal'
import SkeletonLoader from '../../components/SkeletonLoader'
import { CachedImage } from '../../components/CachedImage'
import { NavigationProps } from '../../types'
import {
  colors,
  shadows,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  textStyles,
  borderRadius,
  spacing,
  motion,
  computeKeypadCellSize,
  getContentWidth,
  fontFamily,
  pillRowWrapperStyle,
  pillNoteInputStyle,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { useToast } from '../../components/ToastProvider'
import { useNoahSendExchangeRates, prefetchNoahSendExchangeRates } from '../../hooks/queries'
import { useQueryClient } from '@tanstack/react-query'
import { useYcCrossBorderFlow, type YcPayInRail, residenceCountryFromPayInCurrency } from '../../hooks/useYcCrossBorderFlow'
import { useYcReceiveRails } from '../../hooks/useYcFundBalanceFlow'
import { CountryFlag } from '../../components/flags/CountryFlag'
import { useAuth } from '../../contexts/AuthContext'
import { isTier1Complete, TIER2_COMPLETE_PLACEHOLDER } from '../../lib/compliance'
import { generateTransactionId } from '../../lib/transactionId'
import { useBalance } from '../../contexts/BalanceContext'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import {
  convertNoahSendFlowAmounts,
  exchangeRatesToRateMap,
  hasNoahSendRateRow,
  findPayoutFieldsSchema,
  formatMoneyDisplay,
  formatSendRateLabel,
  normalizePayoutReceiveAmountForCurrency,
  resolveEffectivePayoutMin,
  resolveRecipientPayoutRail,
  resolvePayoutCountryCode,
  getSendAmountNoteFieldUi,
  isWideSendAmountSymbol,
  scaleSendAmountPrefixFontSize,
  scaleSendAmountPrefixLineHeight,
  validateBalancePayoutAmountForProvider,
  validateSendAmountFields,
  validateWalletSendReceiveAmount,
  resolveEffectiveWalletSendMin,
  corridorMatchesCountryCurrency,
  isYcBalancePayoutCorridor,
  resolveEffectiveYcBalancePayoutMinReceive,
  resolveYcPayoutLimits,
  getYcBusinessPayoutMin,
  YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE,
  resolveReceiveCountryName,
  sendLocalPayInBankTitle,
  sendLocalPayInMomoTitle,
  SEND_LOCAL_PAY_IN_BANK_CHIP,
  SEND_LOCAL_PAY_IN_MOMO_CHIP,
  formatYcPayInMinHint,
  validateYcFundBalancePayInAmount,
} from '@easner/shared'
import { usePayoutMinEnforcement } from '../../hooks/usePayoutMinEnforcement'
import { useYcPayoutMinEnforcement } from '../../hooks/useYcPayoutMinEnforcement'
import { useYcPayInMinEnforcement } from '../../hooks/useYcPayInMinEnforcement'
import { useYcSendExchangeRates } from '../../hooks/queries/use-yc-send-exchange-rates'
import { noahService, type WalletSendQuote } from '../../lib/noahService'
import {
  ensureSendPayoutQuoteStashed,
  isCompletePayoutQuote,
  isStashedPayoutQuoteFresh,
  peekLastPayoutQuoteError,
  peekSendPayoutQuote,
  clearSendPayoutQuote,
} from '../../lib/sendFlowPayoutQuote'
import {
  ensureSendWalletQuoteStashed,
  isStashedWalletQuoteFresh,
  peekLastWalletQuoteError,
  peekSendWalletQuote,
  clearSendWalletQuote,
} from '../../lib/sendFlowWalletQuote'
import {
  ensurePayInNetworksCached,
  readCachedPayInNetworks,
} from '../../lib/sendFlowFundBalanceQuote'
import {
  clearCrossBorderQuote,
  ensureCrossBorderQuoteStashed,
  isCompleteCrossBorderQuote,
  isStashedCrossBorderQuoteFresh,
  peekLastCrossBorderQuoteError,
  type CrossBorderQuoteStashMeta,
} from '../../lib/sendFlowCrossBorderQuote'
import { getPayoutCorridorCache, isRecipientPayoutCorridorActive, refreshPayoutCorridors } from '../../lib/payoutCorridors'
import {
  getCachedSendDestinations,
  refreshSendDestinations,
} from '../../lib/sendDestinations'
import type { SendDestinationsResponse } from '@easner/shared'
import { getTokenIconUrl } from '../../lib/cryptoIcons'
import type { Recipient } from '../../types'
import { resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'
import { isMobileMoneyRecipient } from '../../lib/recipientPayoutPreview'
import { isWalletSendRecipient, resolveRecipientWalletNetwork } from '../../lib/recipientWalletMeta'
import { useEasenetRecipientHydration } from '../../hooks/useEasenetRecipientHydration'
import { navigateToSendRecipientHub } from '../../lib/sendFlowNavigation'
import { SendSelectedRecipientSummary } from '../../components/send/SendSelectedRecipientSummary'
import { haptics } from '../../lib/haptics'
import { buildDynamicAmountTextStyle, getDynamicAmountFontSize } from '../../lib/dynamicAmountFontSize'
import { formatSendAgainKeypadAmount } from '../../lib/resolveSendAgainRecipient'
import { getSendAmountFieldSymbol } from '../../lib/sendAmountFieldSymbol'
import { getCurrencySymbol } from '../../utils/formatters'

function initialSendAmountFromRouteParams(params: Record<string, unknown> | undefined): string {
  const formatted = String(params?.initialSendAmount ?? '').trim()
  if (formatted && formatted !== '0') return formatted
  const n = Number(params?.initialAmount)
  if (Number.isFinite(n) && n > 0) return formatSendAgainKeypadAmount(n)
  return '0'
}

function initialAmountEntryModeFromRouteParams(
  params: Record<string, unknown> | undefined,
): 'receive' | 'send' {
  return params?.initialAmountEntryMode === 'send' ? 'send' : 'receive'
}

export default function SendAmountScreen({ navigation, route }: NavigationProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const keypadSizing = computeKeypadCellSize(getContentWidth(windowWidth, spacing[5]), {
    gap: spacing[2],
    minSize: 90,
    maxSize: 114,
  })
  const insets = useSafeAreaInsets()
  const footerPadding = useFixedFooterPadding(spacing[4])
  const { userProfile, refreshUserProfile } = useAuth()
  const { showError, showInfo } = useToast()
  const qc = useQueryClient()
  const noahKycStatus =
    userProfile?.noah_kyc_status ??
    (userProfile as { noah_kyc_status?: string; profile?: { noah_kyc_status?: string } })?.profile?.noah_kyc_status
  const { balances, refreshBalances } = useBalance()
  
  // Get recipient from route params if coming from the send recipient hub
  const recipientFromRoute = (route.params as any)?.recipient as Recipient | undefined
  const preferredBalanceCurrencyFromRoute = String((route.params as any)?.preferredBalanceCurrency || '').toUpperCase()
  const selectedPaymentMethodFromRoute = (route.params as any)?.selectedPaymentMethod as
    | 'balance'
    | 'otherCurrency'
    | undefined
  const selectedOtherCurrencyFromRoute = (route.params as any)?.selectedOtherCurrency as string | undefined
  const selectedOtherPaymentMethodFromRoute = (route.params as any)?.selectedOtherPaymentMethod as string | undefined
  const routeParamsRecord = route.params as Record<string, unknown> | undefined
  const isPreferredBalanceCurrency = preferredBalanceCurrencyFromRoute === 'USD' || preferredBalanceCurrencyFromRoute === 'EUR'
  const didInitializeBalanceCurrency = useRef(false)
  const sendAgainPrefillAppliedRef = useRef(false)
  const [walletQuotePreview, setWalletQuotePreview] = useState<WalletSendQuote | null>(null)
  const [isContinuePending, setIsContinuePending] = useState(false)
  const [isContinueLoading, setIsContinueLoading] = useState(false)
  const continueSpinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // UI State only - no backend integration
  const [recipient, setRecipient] = useState<Recipient | null>(recipientFromRoute || null)
  const easenetDisplay = useEasenetRecipientHydration(recipient)
  /** Internal Easetag P2P does not use fiat payout corridors — don’t block the CTA on corridor status. */
  const easetagUi = recipient ? resolveRecipientEasetagForUi(recipient).trim() : ''
  const isEasetagRecipient = easetagUi.length > 0
  const [payoutCorridorActive, setPayoutCorridorActive] = useState(true)
  const [sendDestinations, setSendDestinations] = useState<SendDestinationsResponse | null>(null)
  const [sendAmount, setSendAmount] = useState(() => initialSendAmountFromRouteParams(routeParamsRecord))
  const [amountEntryMode, setAmountEntryMode] = useState<'receive' | 'send'>(() =>
    initialAmountEntryModeFromRouteParams(routeParamsRecord),
  )
  const [note, setNote] = useState('')
  const [paymentPurpose, setPaymentPurpose] = useState('')
  const [amountFieldError, setAmountFieldError] = useState<string | null>(null)
  const [showPurposePicker, setShowPurposePicker] = useState(false)
  const [selectedBalanceCurrency, setSelectedBalanceCurrency] = useState<string>('USD')
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'balance' | 'otherCurrency'>(
    selectedPaymentMethodFromRoute ?? 'balance'
  )
  const [selectedOtherCurrency, setSelectedOtherCurrency] = useState<string | null>(
    selectedOtherCurrencyFromRoute ?? null
  )
  const [selectedOtherPaymentMethod, setSelectedOtherPaymentMethod] = useState<string | null>(
    selectedOtherPaymentMethodFromRoute ?? null
  )
  const [sendFooterHeight, setSendFooterHeight] = useState(120)

  /** Same-currency Easetag P2P never uses Noah `/prices` (two FX quotes); skip the query to speed the send flow. */
  const resolvedWalletNetwork = useMemo(
    () => resolveRecipientWalletNetwork(recipient),
    [recipient],
  )
  const isWalletRecipientEarly = isWalletSendRecipient(recipient)
  const skipNoahExchangeRatesForEasetagP2p =
    isEasetagRecipient && selectedPaymentMethod === 'balance'
  const {
    data: exchangeRatesFromContext = [],
    isFetched: noahRatesFetched,
  } = useNoahSendExchangeRates(recipient?.currency, {
    enabled: !skipNoahExchangeRatesForEasetagP2p && !isWalletRecipientEarly,
  })

  useEffect(() => {
    if (!recipient?.currency || skipNoahExchangeRatesForEasetagP2p || isWalletRecipientEarly) return
    void prefetchNoahSendExchangeRates(qc, recipient.currency)
  }, [recipient?.currency, skipNoahExchangeRatesForEasetagP2p, isWalletRecipientEarly, qc])

  const isWalletRecipient = isWalletRecipientEarly

  useEffect(() => {
    if (isWalletRecipient && amountEntryMode !== 'receive') {
      setAmountEntryMode('receive')
    }
  }, [isWalletRecipient, amountEntryMode, recipient?.id])

  // Initialize sending balance currency once:
  React.useEffect(() => {
    if (didInitializeBalanceCurrency.current) return
    const usdBalance = parseFloat(balances.USD || '0')
    const eurBalance = parseFloat(balances.EUR || '0')
    if (isPreferredBalanceCurrency) {
      setSelectedBalanceCurrency(preferredBalanceCurrencyFromRoute as 'USD' | 'EUR')
    } else if (usdBalance > 0) {
      setSelectedBalanceCurrency('USD')
    } else if (eurBalance > 0) {
      setSelectedBalanceCurrency('EUR')
    }
    didInitializeBalanceCurrency.current = true
  }, [balances, isPreferredBalanceCurrency, preferredBalanceCurrencyFromRoute])

  // Available currencies for the dropdown (wallet balances - USD/EUR only)
  const availableCurrencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
  ]

  const payoutRail =
    recipient != null
      ? resolveRecipientPayoutRail({
          bank_name: recipient.bank_name,
          mobile_provider: recipient.mobile_provider,
        })
      : 'bank_transfer'
  const payoutCountryCode = useMemo(() => {
    if (!recipient) return ''
    return resolvePayoutCountryCode({
      countryCode: recipient.country_code,
      currencyCode: recipient.currency,
    })
  }, [recipient])
  const payoutHints = useMemo(() => {
    if (!sendDestinations || !recipient || !payoutCountryCode) return null
    const corridors =
      payoutRail === 'mobile_money'
        ? sendDestinations.fiat.mobile_money
        : sendDestinations.fiat.bank_transfer
    return findPayoutFieldsSchema(corridors, {
      countryCode: payoutCountryCode,
      currencyCode: recipient.currency,
      rail: payoutRail,
    })
  }, [sendDestinations, recipient, payoutRail, payoutCountryCode])
  const amountFieldMode = payoutHints?.amount_field_mode ?? 'note_optional_only'
  const noteFieldUi = getSendAmountNoteFieldUi({
    hints: payoutHints,
    isEasetag: isEasetagRecipient,
    receiveCurrency: isEasetagRecipient ? selectedBalanceCurrency : recipient?.currency,
  })

  const enteredAmount = sendAmount ? Number.parseFloat(sendAmount.replace(/,/g, '')) || 0 : 0

  const ycFlow = useYcCrossBorderFlow({
    recipientId: recipient?.id ?? null,
    enabled: !isEasetagRecipient && !isWalletRecipient,
    receiveCurrency: recipient?.currency || 'USD',
    amountEntryMode,
    enteredAmount,
  })

  const showThroughLocalCurrency = ycFlow.available && !isEasetagRecipient
  const payInCurrency = ycFlow.payInCurrency
  const payInCountry = payInCurrency ? residenceCountryFromPayInCurrency(payInCurrency) : null
  const payInCountryName = payInCountry ? resolveReceiveCountryName(payInCountry) : ''

  const { rails: payInRails, loading: payInRailsLoading } = useYcReceiveRails({
    country: payInCountry,
    currency: payInCurrency,
    enabled: showThroughLocalCurrency && Boolean(payInCountry && payInCurrency),
  })

  const localPayInOptions = useMemo(() => {
    if (!payInCurrency || !payInCountry || !payInRails) return []
    const opts: { rail: YcPayInRail; title: string }[] = []
    if (payInRails.rails.bank_transfer.available) {
      opts.push({ rail: 'bank_transfer', title: sendLocalPayInBankTitle(payInCountryName) })
    }
    if (payInRails.rails.mobile_money.available) {
      opts.push({ rail: 'mobile_money', title: sendLocalPayInMomoTitle(payInCountryName) })
    }
    return opts
  }, [payInCurrency, payInCountry, payInCountryName, payInRails])

  useEffect(() => {
    if (showThroughLocalCurrency) return
    if (selectedPaymentMethod === 'otherCurrency' || selectedOtherCurrency || selectedOtherPaymentMethod) {
      setSelectedPaymentMethod('balance')
      setSelectedOtherCurrency(null)
      setSelectedOtherPaymentMethod(null)
    }
  }, [showThroughLocalCurrency, selectedPaymentMethod, selectedOtherCurrency, selectedOtherPaymentMethod])

  useEffect(() => {
    if (!isEasetagRecipient) return
    if (
      selectedPaymentMethod === 'otherCurrency' ||
      selectedOtherCurrency ||
      selectedOtherPaymentMethod
    ) {
      setSelectedPaymentMethod('balance')
      setSelectedOtherCurrency(null)
      setSelectedOtherPaymentMethod(null)
    }
  }, [isEasetagRecipient, selectedPaymentMethod, selectedOtherCurrency, selectedOtherPaymentMethod])

  useEffect(() => {
    if (
      selectedPaymentMethod !== 'otherCurrency' ||
      !showThroughLocalCurrency ||
      selectedOtherPaymentMethod !== 'mobile_money' ||
      !selectedOtherCurrency
    ) {
      return
    }
    const payInCountry = residenceCountryFromPayInCurrency(selectedOtherCurrency)
    if (!payInCountry) return
    if (readCachedPayInNetworks(payInCountry, selectedOtherCurrency)?.length) return
    void ensurePayInNetworksCached(payInCountry, selectedOtherCurrency)
  }, [
    selectedPaymentMethod,
    showThroughLocalCurrency,
    selectedOtherPaymentMethod,
    selectedOtherCurrency,
  ])

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  // Update recipient when screen comes into focus (smooth transition)
  useFocusEffect(
    React.useCallback(() => {
      /** Match dashboard Turnkey/Noah truth — send flow must not show stale wallet zeros. */
      void refreshBalances(true).catch(() => {})
      if (noahKycStatus !== 'approved') {
        void refreshUserProfile()
      }
      const params = route.params as Record<string, unknown> | undefined
      if (params?.recipient) {
        // Update recipient immediately for smooth transition
        setRecipient(params.recipient as Recipient)
      }
      if (params?.fromSendAgain && !sendAgainPrefillAppliedRef.current) {
        const prefilled = initialSendAmountFromRouteParams(params)
        if (prefilled !== '0') {
          setSendAmount(prefilled)
          setAmountEntryMode(initialAmountEntryModeFromRouteParams(params))
        }
        sendAgainPrefillAppliedRef.current = true
      }
      if (params?.selectedPaymentMethod) {
        setSelectedPaymentMethod(params.selectedPaymentMethod as typeof selectedPaymentMethod)
      }
      if (typeof params?.selectedOtherCurrency === 'string' || params?.selectedOtherCurrency === null) {
        setSelectedOtherCurrency(params.selectedOtherCurrency ?? null)
      }
      if (typeof params?.selectedOtherPaymentMethod === 'string' || params?.selectedOtherPaymentMethod === null) {
        setSelectedOtherPaymentMethod(params.selectedOtherPaymentMethod ?? null)
      }
    }, [route.params, refreshUserProfile, noahKycStatus, refreshBalances])
  )

  useFocusEffect(
    React.useCallback(() => {
      void getCachedSendDestinations().then((c) => {
        if (c) setSendDestinations(c)
      })
      void refreshSendDestinations().then((c) => {
        if (c) setSendDestinations(c)
      })
      void refreshPayoutCorridors().then(() => {
        const params = route.params as { recipient?: Recipient } | undefined
        const r = params?.recipient || recipient
        if (r) {
          setPayoutCorridorActive(isRecipientPayoutCorridorActive(r, getPayoutCorridorCache()))
        } else {
          setPayoutCorridorActive(true)
        }
      })
    }, [route.params, recipient]),
  )

  // Run entrance animations
  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  // Format amount with commas, optional decimal, max 2 decimals.
  const formatAmount = (rawValue: string): string => {
    const input = String(rawValue || '').replace(/,/g, '').replace(/[^0-9.]/g, '')
    if (!input) return '0'

    const hasDot = input.includes('.')
    const [rawInteger = '0', rawDecimal = ''] = input.split('.')
    const normalizedInteger = rawInteger.replace(/^0+(?=\d)/, '') || '0'
    const formattedInteger = normalizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

    if (!hasDot) return formattedInteger
    return `${formattedInteger}.${rawDecimal.slice(0, 2)}`
  }

  // Keypad handlers - natural typing with optional decimal mode.
  const handleKeypadPress = (value: string) => {
    if (!recipient) return // Disabled until recipient is selected
    
    haptics.tap()

    let raw = sendAmount.replace(/,/g, '')

    if (value === 'backspace') {
      const next = raw.slice(0, -1)
      setSendAmount(formatAmount(next))
      return
    }

    if (value === '.') {
      if (raw.includes('.')) return
      setSendAmount(formatAmount(`${raw}.`))
      return
    }

    // Numeric key
    if (!/^\d$/.test(value)) return
    if (raw.includes('.')) {
      const decimals = raw.split('.')[1] ?? ''
      if (decimals.length >= 2) return
    }

    if (raw === '0') raw = value
    else raw += value
    setSendAmount(formatAmount(raw))
  }

  const toSwitchInputAmount = (amount: number): string => {
    const roundedAmount = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100
    const fractionalPart = Math.abs(roundedAmount - Math.trunc(roundedAmount))
    return fractionalPart >= 0.01 ? roundedAmount.toFixed(2) : String(Math.trunc(roundedAmount))
  }

  const currentBalance = Number.parseFloat(
    String(balances[selectedBalanceCurrency as 'USD' | 'EUR'] || '0').replace(/,/g, ''),
  ) || 0
  const sendCurrency =
    selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency
      ? selectedOtherCurrency
      : selectedBalanceCurrency
  // Easetag P2P is same-currency: amount UI follows the selected source balance (USD or EUR).
  const receiveCurrency = isEasetagRecipient
    ? sendCurrency
    : recipient?.currency || 'EUR'
  const dynamicAmountFontSize = getDynamicAmountFontSize(sendAmount)
  const dynamicAmountLineHeight = Math.round(dynamicAmountFontSize * 1.12)
  const amountTextBase = buildDynamicAmountTextStyle(textStyles.balanceDisplay, sendAmount)
  const amountDisplayCurrency = amountEntryMode === 'receive' ? receiveCurrency : sendCurrency
  const amountDisplaySymbol = getSendAmountFieldSymbol(
    amountDisplayCurrency || selectedBalanceCurrency,
  )
  const wideAmountSymbol = isWideSendAmountSymbol(amountDisplaySymbol)
  const amountTextStyle = {
    ...amountTextBase,
  }
  const amountPrefixStyle = wideAmountSymbol
    ? {
        fontSize: scaleSendAmountPrefixFontSize(dynamicAmountFontSize, amountDisplaySymbol),
        lineHeight: scaleSendAmountPrefixLineHeight(dynamicAmountLineHeight, amountDisplaySymbol),
      }
    : null
  // Keep the amount band fixed so dynamic number-size changes never push/pull the
  // balance/note/keypad/KYC/CTA group vertically. Tall enough for dynamic headline lineHeight on iOS.
  const amountRowHeight = Math.max(
    Platform.select({ ios: 108, default: 116 }) ?? 116,
    dynamicAmountLineHeight + spacing[2],
  )

  const showCrossCurrencyExchangeUi =
    !isWalletRecipient &&
    String(sendCurrency || '').toUpperCase() !== String(receiveCurrency || '').toUpperCase()

  const noahRateMap = useMemo(
    () => exchangeRatesToRateMap(exchangeRatesFromContext),
    [exchangeRatesFromContext],
  )

  const hasNoahRateForPair = useMemo(() => {
    if (isWalletRecipient) return true
    if (!showCrossCurrencyExchangeUi) return true
    const send = String(sendCurrency || '').trim().toUpperCase()
    const receive = String(receiveCurrency || '').trim().toUpperCase()
    if (send === receive) return true
    const row = exchangeRatesFromContext.find(
      (r) =>
        String(r.from_currency || '').toUpperCase() === send &&
        String(r.to_currency || '').toUpperCase() === receive,
    )
    return hasNoahSendRateRow(row ? { rate: row.rate } : null)
  }, [
    isWalletRecipient,
    showCrossCurrencyExchangeUi,
    sendCurrency,
    receiveCurrency,
    exchangeRatesFromContext,
  ])

  const needsNoahRateForSend =
    selectedPaymentMethod === 'balance' &&
    !isEasetagRecipient &&
    !isWalletRecipient &&
    showCrossCurrencyExchangeUi

  const ycQuoteEnabled =
    !isEasetagRecipient &&
    showThroughLocalCurrency &&
    selectedPaymentMethod === 'otherCurrency' &&
    !!selectedOtherCurrency &&
    showCrossCurrencyExchangeUi &&
    enteredAmount > 0

  const tlcPayInRail = (selectedOtherPaymentMethod === 'mobile_money'
    ? 'mobile_money'
    : 'bank_transfer') as YcPayInRail
  const tlcPayInLimits = useMemo(() => {
    if (!payInRails || selectedPaymentMethod !== 'otherCurrency') {
      return { minLocalPayIn: null as number | null, maxLocalPayIn: null as number | null }
    }
    const railInfo =
      tlcPayInRail === 'mobile_money'
        ? payInRails.rails.mobile_money
        : payInRails.rails.bank_transfer
    return {
      minLocalPayIn: railInfo?.minLocalPayIn ?? null,
      maxLocalPayIn: railInfo?.maxLocalPayIn ?? null,
    }
  }, [payInRails, selectedPaymentMethod, tlcPayInRail])

  const tlcMinHint =
    tlcPayInLimits.minLocalPayIn != null && ycFlow.customerRate
      ? formatYcPayInMinHint({
          minLocalPayIn: tlcPayInLimits.minLocalPayIn,
          currency: selectedOtherCurrency ?? payInCurrency ?? '',
          customerSellRate: ycFlow.customerRate,
        })
      : null

  const tlcMinSeedKey =
    selectedPaymentMethod === 'otherCurrency' &&
    selectedOtherCurrency &&
    selectedOtherPaymentMethod &&
    ycFlow.customerRate
      ? `${selectedOtherCurrency}:${tlcPayInRail}:${amountEntryMode}`
      : null

  useYcPayInMinEnforcement({
    enabled:
      selectedPaymentMethod === 'otherCurrency' &&
      showThroughLocalCurrency &&
      Boolean(selectedOtherCurrency && selectedOtherPaymentMethod && ycFlow.customerRate),
    seedKey: tlcMinSeedKey,
    minLocalPayIn: tlcPayInLimits.minLocalPayIn,
    amountEntryMode: amountEntryMode === 'receive' ? 'usd' : 'local',
    enteredAmount,
    customerSellRate: ycFlow.customerRate,
    onApplyEnteredAmount: (amount) => {
      setSendAmount(formatAmount(amount.toFixed(2)))
    },
  })

  const tlcAmountLimitOk = useMemo(() => {
    if (selectedPaymentMethod !== 'otherCurrency' || !showThroughLocalCurrency) return true
    if (!enteredAmount || !ycFlow.customerRate) return true
    return validateYcFundBalancePayInAmount({
      amountEntryMode: amountEntryMode === 'receive' ? 'usd' : 'local',
      enteredAmount,
      previewLocalPayIn: ycFlow.preview.sendAmount,
      currency: selectedOtherCurrency ?? payInCurrency ?? '',
      limits: tlcPayInLimits,
    }).ok
  }, [
    selectedPaymentMethod,
    showThroughLocalCurrency,
    enteredAmount,
    ycFlow.customerRate,
    ycFlow.preview.sendAmount,
    amountEntryMode,
    selectedOtherCurrency,
    payInCurrency,
    tlcPayInLimits,
  ])

  const ycRateLoading = ycQuoteEnabled && ycFlow.ratesLoading && !ycFlow.customerRate

  const walletMinReceive = useMemo(() => {
    if (!isWalletRecipient || !resolvedWalletNetwork) {
      return resolveEffectiveWalletSendMin({
        receiveCurrency: receiveCurrency,
        receiveNetwork: 'Solana',
        customerRate: 1,
      })
    }
    return resolveEffectiveWalletSendMin({
      receiveCurrency,
      receiveNetwork: resolvedWalletNetwork,
      customerRate: 1,
    })
  }, [isWalletRecipient, resolvedWalletNetwork, receiveCurrency])

  const noahRatesLoading =
    needsNoahRateForSend &&
    !hasNoahRateForPair &&
    !noahRatesFetched

  const exchangePreviewReady =
    !showCrossCurrencyExchangeUi ||
    isWalletRecipient ||
    (ycQuoteEnabled ? Boolean(ycFlow.customerRate) : !needsNoahRateForSend || hasNoahRateForPair)

  const flowAmounts = useMemo(() => {
    if (!showCrossCurrencyExchangeUi || enteredAmount <= 0) {
      return { sendAmount: enteredAmount, receiveAmount: enteredAmount, forwardRate: 1 }
    }
    if (selectedPaymentMethod === 'otherCurrency' && showThroughLocalCurrency && ycFlow.customerRate) {
      return ycFlow.preview
    }
    if (!hasNoahRateForPair) {
      const fallback = convertNoahSendFlowAmounts({
        direction: amountEntryMode,
        amount: enteredAmount,
        sendCurrency,
        receiveCurrency,
        rateMap: noahRateMap,
      })
      return {
        sendAmount: fallback.sendAmount,
        receiveAmount: fallback.receiveAmount,
        forwardRate: fallback.forwardRate,
      }
    }
    return convertNoahSendFlowAmounts({
      direction: amountEntryMode,
      amount: enteredAmount,
      sendCurrency,
      receiveCurrency,
      rateMap: noahRateMap,
    })
  }, [
    showCrossCurrencyExchangeUi,
    enteredAmount,
    amountEntryMode,
    sendCurrency,
    receiveCurrency,
    noahRateMap,
    selectedPaymentMethod,
    showThroughLocalCurrency,
    ycFlow.preview,
    ycFlow.customerRate,
    hasNoahRateForPair,
  ])

  const receiveAmount = normalizePayoutReceiveAmountForCurrency(
    receiveCurrency,
    flowAmounts.receiveAmount,
  )
  const sendingAmount = flowAmounts.sendAmount
  const exchangeRate = flowAmounts.forwardRate

  const crossBorderBankQuoteMeta = useMemo((): CrossBorderQuoteStashMeta | null => {
    if (
      selectedPaymentMethod !== 'otherCurrency' ||
      !showThroughLocalCurrency ||
      !selectedOtherCurrency ||
      tlcPayInRail !== 'bank_transfer' ||
      !recipient?.id ||
      !(receiveAmount > 0)
    ) {
      return null
    }
    const payInCountry = residenceCountryFromPayInCurrency(selectedOtherCurrency)
    if (!payInCountry) return null
    return {
      recipientId: recipient.id,
      payInCurrency: selectedOtherCurrency,
      payInCountry,
      payInRail: 'bank_transfer',
      receiveAmount,
    }
  }, [
    selectedPaymentMethod,
    showThroughLocalCurrency,
    selectedOtherCurrency,
    tlcPayInRail,
    recipient?.id,
    receiveAmount,
  ])

  const crossBorderBankPrefetchKey = crossBorderBankQuoteMeta
    ? [
        crossBorderBankQuoteMeta.recipientId,
        crossBorderBankQuoteMeta.payInCurrency,
        crossBorderBankQuoteMeta.payInCountry,
        crossBorderBankQuoteMeta.receiveAmount,
      ].join('|')
    : ''

  useEffect(() => {
    clearCrossBorderQuote()
  }, [recipient?.id, selectedOtherCurrency, tlcPayInRail])

  useEffect(() => {
    if (!crossBorderBankPrefetchKey || !crossBorderBankQuoteMeta) return
    void ensureCrossBorderQuoteStashed(crossBorderBankQuoteMeta)
  }, [crossBorderBankPrefetchKey, crossBorderBankQuoteMeta])

  const payoutMinReceive = useMemo(
    () =>
      recipient && !isEasetagRecipient
        ? resolveEffectivePayoutMin({
            hints: payoutHints,
            currencyCode: receiveCurrency,
            rail: payoutRail,
          })
        : null,
    [recipient, isEasetagRecipient, payoutHints, receiveCurrency, payoutRail],
  )

  const payoutCorridorRow = useMemo(() => {
    if (!sendDestinations || !recipient || !payoutCountryCode) return null
    const corridors =
      payoutRail === 'mobile_money'
        ? sendDestinations.fiat.mobile_money
        : sendDestinations.fiat.bank_transfer
    return (
      corridors.find((c) =>
        corridorMatchesCountryCurrency(c, {
          countryCode: payoutCountryCode,
          currencyCode: recipient.currency,
          rail: payoutRail,
        }),
      ) ?? null
    )
  }, [sendDestinations, recipient, payoutCountryCode, payoutRail])

  const isYcBalancePayout =
    selectedPaymentMethod === 'balance' &&
    !isEasetagRecipient &&
    !isWalletRecipient &&
    isYcBalancePayoutCorridor(payoutCorridorRow)

  const { data: ycSendRates = [] } = useYcSendExchangeRates(receiveCurrency, {
    enabled: isYcBalancePayout,
  })

  const ycPayoutCustomerRate = useMemo(() => {
    if (!isYcBalancePayout) return null
    const send = String(sendCurrency || '').trim().toUpperCase()
    const receive = String(receiveCurrency || '').trim().toUpperCase()
    const row = ycSendRates.find(
      (r) =>
        String(r.from_currency || '').toUpperCase() === send &&
        String(r.to_currency || '').toUpperCase() === receive,
    )
    return row?.rate ?? null
  }, [isYcBalancePayout, ycSendRates, sendCurrency, receiveCurrency])

  const ycPayoutRateMap = useMemo(() => {
    if (!ycPayoutCustomerRate) return {}
    const send = String(sendCurrency || '').trim().toUpperCase()
    const receive = String(receiveCurrency || '').trim().toUpperCase()
    return { [`${send}_${receive}`]: ycPayoutCustomerRate }
  }, [sendCurrency, receiveCurrency, ycPayoutCustomerRate])

  const ycPayoutLimits = useMemo(() => {
    if (!isYcBalancePayout || !payoutCountryCode) return null
    return resolveYcPayoutLimits({
      country: payoutCountryCode,
      currency: receiveCurrency,
      rail: payoutRail,
    })
  }, [isYcBalancePayout, payoutCountryCode, receiveCurrency, payoutRail])

  const ycPayoutMinReceive = useMemo(() => {
    if (!isYcBalancePayout || !ycPayoutCustomerRate || !ycPayoutLimits) return null
    return resolveEffectiveYcBalancePayoutMinReceive({
      customerRate: ycPayoutCustomerRate,
      receiveCurrency,
      limits: ycPayoutLimits,
      businessMinReceive: getYcBusinessPayoutMin(receiveCurrency, payoutRail),
    })
  }, [
    isYcBalancePayout,
    ycPayoutCustomerRate,
    receiveCurrency,
    ycPayoutLimits,
    payoutRail,
  ])

  const ycFxRateMap = useMemo(() => {
    const from = ycFlow.payInCurrency?.trim().toUpperCase()
    const to = receiveCurrency.trim().toUpperCase()
    if (!from || !to || !ycFlow.customerRate) return {}
    return { [`${from}_${to}`]: ycFlow.customerRate }
  }, [ycFlow.payInCurrency, ycFlow.customerRate, receiveCurrency])

  const payoutEnforcementRateMap =
    isYcBalancePayout && ycPayoutCustomerRate
      ? ycPayoutRateMap
      : selectedPaymentMethod === 'otherCurrency' && showThroughLocalCurrency
        ? ycFxRateMap
        : noahRateMap

  const payoutMinEnforcementEnabled =
    Boolean(recipient) &&
    !isEasetagRecipient &&
    !isWalletRecipient &&
    !isYcBalancePayout &&
    (selectedPaymentMethod === 'balance' ||
      (selectedPaymentMethod === 'otherCurrency' && Boolean(selectedOtherCurrency)))

  const ycPayoutMinEnforcementEnabled =
    Boolean(recipient) &&
    !isEasetagRecipient &&
    !isWalletRecipient &&
    isYcBalancePayout &&
    Boolean(ycPayoutCustomerRate && ycPayoutMinReceive)

  const payoutMinSeedKey = recipient
    ? `${recipient.id}:${receiveCurrency}:${payoutRail}:${selectedPaymentMethod}:${selectedOtherCurrency ?? ''}`
    : null

  usePayoutMinEnforcement({
    enabled: payoutMinEnforcementEnabled,
    seedKey: payoutMinSeedKey,
    minReceive: payoutMinReceive,
    amountEntryMode,
    enteredAmount,
    sendCurrency,
    receiveCurrency,
    rateMap: payoutEnforcementRateMap,
    onApplyEnteredAmount: (amount) => {
      setSendAmount(formatAmount(amount.toFixed(2)))
    },
  })

  useYcPayoutMinEnforcement({
    enabled: ycPayoutMinEnforcementEnabled,
    seedKey: payoutMinSeedKey,
    minReceive: ycPayoutMinReceive,
    minSendUsd: YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE,
    amountEntryMode,
    enteredAmount,
    sendCurrency,
    receiveCurrency,
    customerRate: ycPayoutCustomerRate,
    rateMap: ycPayoutRateMap,
    onApplyEnteredAmount: (amount) => {
      setSendAmount(formatAmount(amount.toFixed(2)))
    },
  })

  const walletMinEnforcementEnabled =
    isWalletRecipient && selectedPaymentMethod === 'balance'

  const walletMinSeedKey =
    recipient && resolvedWalletNetwork
      ? `${recipient.id}:${receiveCurrency}:${resolvedWalletNetwork}:${selectedBalanceCurrency}`
      : null

  usePayoutMinEnforcement({
    enabled: walletMinEnforcementEnabled,
    seedKey: walletMinSeedKey,
    minReceive: walletMinReceive,
    amountEntryMode: 'receive',
    enteredAmount,
    sendCurrency,
    receiveCurrency,
    rateMap: {},
    onApplyEnteredAmount: (amount) => {
      setSendAmount(formatAmount(amount.toFixed(2)))
    },
  })

  const feeAmount = 0
  const totalAmount =
    selectedPaymentMethod === 'otherCurrency' && showThroughLocalCurrency
      ? sendingAmount
      : sendingAmount

  const walletQuoteStashMeta = useMemo(
    () => ({
      recipientId: recipient?.id ?? '',
      amountEntryMode: 'receive' as const,
      entryAmount: receiveAmount,
      receiveCurrency,
    }),
    [recipient?.id, receiveAmount, receiveCurrency],
  )

  const walletQuoteFresh = isStashedWalletQuoteFresh(walletQuoteStashMeta)

  /** Debit from wallet when paying from balance (includes fees when FX order amounts are available). */
  const balanceDebitEstimate =
    selectedPaymentMethod === 'balance' && recipient && receiveAmount > 0
      ? isWalletRecipient &&
        walletQuotePreview &&
        walletQuoteFresh &&
        walletQuotePreview.totalDebited > 0
        ? walletQuotePreview.totalDebited
        : totalAmount > 0
          ? totalAmount
          : sendingAmount > 0
            ? sendingAmount
            : 0
      : 0

  const balanceDebitCents = Math.round((Number.isFinite(balanceDebitEstimate) ? balanceDebitEstimate : 0) * 100)
  const currentBalanceCents = Math.round((Number.isFinite(currentBalance) ? currentBalance : 0) * 100)
  const hasInsufficientBalance =
    selectedPaymentMethod === 'balance' &&
    !!recipient &&
    receiveAmount > 0 &&
    balanceDebitCents > 0 &&
    currentBalanceCents < balanceDebitCents

  const toggleAmountDirection = () => {
    if (!recipient || isWalletRecipient) return
    if (amountEntryMode === 'receive') {
      if (!sendingAmount || sendingAmount <= 0) return
      setAmountEntryMode('send')
      setSendAmount(formatAmount(toSwitchInputAmount(sendingAmount)))
      return
    }
    if (!receiveAmount || receiveAmount <= 0) return
    setAmountEntryMode('receive')
    setSendAmount(formatAmount(toSwitchInputAmount(receiveAmount)))
  }

  const tier1Ok = isTier1Complete(userProfile)
  const tier2Ok = TIER2_COMPLETE_PLACEHOLDER
  const showVerificationNotice = !tier1Ok
  const ctaTopPadding = showVerificationNotice ? spacing[2] : spacing[2]
  const verificationBlocksSend =
    receiveAmount > 0 &&
    (selectedPaymentMethod === 'balance' || selectedPaymentMethod === 'otherCurrency'
      ? !tier1Ok
      : false)

  const needsBackgroundPayoutQuote =
    selectedPaymentMethod === 'balance' &&
    !isEasetagRecipient &&
    !isWalletRecipient &&
    receiveAmount > 0 &&
    Boolean(recipient?.id)

  const payoutQuotePrefetchKey = useMemo(() => {
    if (!needsBackgroundPayoutQuote || !recipient?.id) return ''
    return [
      recipient.id,
      amountEntryMode,
      amountEntryMode === 'send' ? sendingAmount : receiveAmount,
      selectedBalanceCurrency,
      note.trim(),
      paymentPurpose.trim(),
    ].join('|')
  }, [
    needsBackgroundPayoutQuote,
    recipient?.id,
    amountEntryMode,
    sendingAmount,
    receiveAmount,
    selectedBalanceCurrency,
    note,
    paymentPurpose,
  ])

  useEffect(() => {
    if (!payoutQuotePrefetchKey || !recipient?.id) return
    const meta = {
      recipientId: recipient.id,
      amountEntryMode,
      entryAmount: amountEntryMode === 'send' ? sendingAmount : receiveAmount,
      receiveCurrency,
    }
    void ensureSendPayoutQuoteStashed(
      () =>
        noahService.createPayoutQuote({
          recipientId: recipient!.id,
          receiveAmount,
          sourceBalanceCurrency: selectedBalanceCurrency,
          amountEntryMode,
          ...(amountEntryMode === 'send' && sendingAmount > 0 ? { sendAmount: sendingAmount } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(paymentPurpose.trim() ? { paymentPurpose: paymentPurpose.trim() } : {}),
        }),
      meta,
    )
  }, [payoutQuotePrefetchKey, recipient, receiveAmount, receiveCurrency, selectedBalanceCurrency, amountEntryMode, sendingAmount, note, paymentPurpose])

  const needsBackgroundWalletSendQuote =
    selectedPaymentMethod === 'balance' &&
    isWalletRecipient &&
    receiveAmount > 0 &&
    Boolean(recipient?.id)

  const walletQuotePrefetchKey = useMemo(() => {
    if (!needsBackgroundWalletSendQuote || !recipient?.id) return ''
    return [recipient.id, receiveAmount, selectedBalanceCurrency].join('|')
  }, [needsBackgroundWalletSendQuote, recipient?.id, receiveAmount, selectedBalanceCurrency])

  useEffect(() => {
    if (!walletQuotePrefetchKey || !recipient?.id) return
    let cancelled = false
    void ensureSendWalletQuoteStashed(
      () =>
        noahService.createWalletSendQuote({
          recipientId: recipient!.id,
          sourceBalanceCurrency: selectedBalanceCurrency,
          amountEntryMode: 'receive',
          receiveAmount,
        }),
      walletQuoteStashMeta,
    ).then((quote) => {
      if (!cancelled) setWalletQuotePreview(quote)
    })
    return () => {
      cancelled = true
    }
  }, [walletQuotePrefetchKey, recipient, receiveAmount, selectedBalanceCurrency, walletQuoteStashMeta])

  useEffect(() => {
    clearSendPayoutQuote()
    clearSendWalletQuote()
    setWalletQuotePreview(null)
  }, [recipient?.id])

  const exchangeInfoAmountPositive =
    !!(recipient && sendAmount && Number.parseFloat(sendAmount.replace(/,/g, '')) > 0)

  const effectivePayoutMinReceive =
    isYcBalancePayout && ycPayoutMinReceive != null
      ? ycPayoutMinReceive
      : payoutMinReceive

  const payoutReceiveBelowMin =
    effectivePayoutMinReceive != null &&
    !isEasetagRecipient &&
    !isWalletRecipient &&
    receiveAmount > 0 &&
    receiveAmount < effectivePayoutMinReceive

  const sendButtonDisabled =
    isContinuePending ||
    isContinueLoading ||
    !sendAmount ||
    sendAmount === '0.00' ||
    Number.parseFloat(sendAmount.replace(/,/g, '')) <= 0 ||
    !recipient ||
    (!isEasetagRecipient && !payoutCorridorActive) ||
    !selectedPaymentMethod ||
    (selectedPaymentMethod === 'otherCurrency' && (!selectedOtherCurrency || !selectedOtherPaymentMethod)) ||
    verificationBlocksSend ||
    hasInsufficientBalance ||
    (isWalletRecipient &&
      selectedPaymentMethod === 'balance' &&
      receiveAmount > 0 &&
      receiveAmount < walletMinReceive) ||
    payoutReceiveBelowMin ||
    !tlcAmountLimitOk ||
    (exchangeInfoAmountPositive && showCrossCurrencyExchangeUi && !exchangePreviewReady)

  const showExchangePreviewSkeleton =
    exchangeInfoAmountPositive &&
    showCrossCurrencyExchangeUi &&
    !exchangePreviewReady &&
    (noahRatesLoading || ycRateLoading)

  const displayBalanceForSource =
    selectedPaymentMethod === 'balance'
      ? currentBalance - (balanceDebitEstimate > 0 ? balanceDebitEstimate : 0)
      : 0

  const shortfallAmount =
    hasInsufficientBalance && selectedPaymentMethod === 'balance'
      ? Math.max(0, balanceDebitEstimate - currentBalance)
      : 0

  const sourceDisplayLabel = (() => {
    if (selectedPaymentMethod === 'balance') {
      const fig = displayBalanceForSource.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      return `${selectedBalanceCurrency} Balance • ${getCurrencySymbol(selectedBalanceCurrency)}${fig}`
    }
    if (selectedOtherCurrency && selectedOtherPaymentMethod) {
      return selectedOtherPaymentMethod === 'mobile_money'
        ? SEND_LOCAL_PAY_IN_MOMO_CHIP
        : SEND_LOCAL_PAY_IN_BANK_CHIP
    }
    if (selectedPaymentMethod === 'otherCurrency') {
      return 'Select method'
    }
    return 'Select method'
  })()

  const handleSendContinue = async () => {
    if (isContinuePending || isContinueLoading) return
    try {
      const enteredAmountValue = Number.parseFloat(sendAmount.replace(/,/g, ''))
      if (!sendAmount || sendAmount === '0' || enteredAmountValue <= 0 || !recipient || !selectedPaymentMethod) return

      if (selectedPaymentMethod === 'otherCurrency' && (!selectedOtherCurrency || !selectedOtherPaymentMethod)) return

      if (isEasetagRecipient && selectedPaymentMethod === 'otherCurrency') {
        showError('Easetag sends are only supported from your balance.')
        return
      }

      if (verificationBlocksSend) return

      const fieldCheck = validateSendAmountFields({
        hints: payoutHints,
        note,
        paymentPurpose,
        isEasetag: isEasetagRecipient,
        receiveCurrency: recipient?.currency,
      })
      if (!fieldCheck.ok) {
        setAmountFieldError(fieldCheck.message)
        showError(fieldCheck.message)
        return
      }
      setAmountFieldError(null)

      haptics.medium()

      const walletReceiveAmount = normalizePayoutReceiveAmountForCurrency(
        receiveCurrency,
        enteredAmountValue,
      )

      const navRateMap = isWalletRecipient ? {} : noahRateMap
      const navAmounts = isWalletRecipient
        ? {
            sendAmount: walletReceiveAmount,
            receiveAmount: walletReceiveAmount,
            forwardRate: 1,
          }
        : sendCurrency !== receiveCurrency
          ? convertNoahSendFlowAmounts({
              direction: amountEntryMode,
              amount: enteredAmountValue,
              sendCurrency,
              receiveCurrency,
              rateMap: navRateMap,
            })
          : {
              sendAmount: enteredAmountValue,
              receiveAmount: enteredAmountValue,
              forwardRate: 1,
            }
      let receiveAmountValue = isWalletRecipient
        ? walletReceiveAmount
        : normalizePayoutReceiveAmountForCurrency(receiveCurrency, navAmounts.receiveAmount)
      const quoteStashMeta = {
        recipientId: recipient.id,
        amountEntryMode: isWalletRecipient ? ('receive' as const) : amountEntryMode,
        entryAmount: isWalletRecipient
          ? walletReceiveAmount
          : amountEntryMode === 'send'
            ? navAmounts.sendAmount
            : receiveAmountValue,
        receiveCurrency,
      }

      if (
        isWalletRecipient &&
        selectedPaymentMethod === 'balance' &&
        receiveAmountValue > 0
      ) {
        const walletMinCheck = validateWalletSendReceiveAmount(
          receiveAmountValue,
          receiveCurrency,
          { minReceive: walletMinReceive },
        )
        if (!walletMinCheck.ok) {
          setAmountFieldError(walletMinCheck.message)
          showError(walletMinCheck.message)
          return
        }
      }

      if (
        !isEasetagRecipient &&
        !isWalletRecipient &&
        (selectedPaymentMethod === 'balance' || selectedPaymentMethod === 'otherCurrency') &&
        receiveAmountValue > 0
      ) {
        const limitCheck = validateBalancePayoutAmountForProvider({
          providerRouting: payoutCorridorRow?.provider_routing,
          sourceBalanceCurrency: sendCurrency,
          amountEntryMode,
          receiveAmount: receiveAmountValue,
          sendAmount: navAmounts.sendAmount,
          customerRate: exchangeRate,
          sendCurrency,
          receiveCurrency,
          rail: payoutRail,
          noahHints: payoutHints,
          ycLimits: ycPayoutLimits,
        })
        if (!limitCheck.ok) {
          setAmountFieldError(limitCheck.message)
          showError(limitCheck.message)
          return
        }
      }

      const needsQuoteAwait =
        selectedPaymentMethod === 'balance' &&
        ((isWalletRecipient && walletReceiveAmount > 0) ||
          (!isEasetagRecipient && !isWalletRecipient && receiveAmountValue > 0))

      const quoteAlreadyWarm =
        needsQuoteAwait &&
        (isWalletRecipient
          ? isStashedWalletQuoteFresh(quoteStashMeta)
          : isStashedPayoutQuoteFresh(quoteStashMeta))

      if (needsQuoteAwait && !quoteAlreadyWarm) {
        setIsContinuePending(true)
        continueSpinnerTimerRef.current = setTimeout(() => setIsContinueLoading(true), 175)
      }

      const stashedWalletQuote =
        selectedPaymentMethod === 'balance' &&
        isWalletRecipient &&
        receiveAmountValue > 0
          ? await ensureSendWalletQuoteStashed(
              () =>
                noahService.createWalletSendQuote({
                  recipientId: recipient.id,
                  sourceBalanceCurrency: selectedBalanceCurrency,
                  amountEntryMode: 'receive',
                  receiveAmount: receiveAmountValue,
                }),
              quoteStashMeta,
            )
          : isStashedWalletQuoteFresh(quoteStashMeta)
            ? peekSendWalletQuote()
            : null

      const stashedQuote =
        selectedPaymentMethod === 'balance' &&
        !isEasetagRecipient &&
        !isWalletRecipient &&
        receiveAmountValue > 0
          ? await ensureSendPayoutQuoteStashed(
              () =>
                noahService.createPayoutQuote({
                  recipientId: recipient.id,
                  receiveAmount: receiveAmountValue,
                  sourceBalanceCurrency: selectedBalanceCurrency,
                  amountEntryMode,
                  ...(amountEntryMode === 'send' && navAmounts.sendAmount > 0
                    ? { sendAmount: navAmounts.sendAmount }
                    : {}),
                  ...(note.trim() ? { note: note.trim() } : {}),
                  ...(paymentPurpose.trim() ? { paymentPurpose: paymentPurpose.trim() } : {}),
                }),
              quoteStashMeta,
            )
          : isStashedPayoutQuoteFresh(quoteStashMeta)
            ? peekSendPayoutQuote()
            : null

      if (
        selectedPaymentMethod === 'balance' &&
        isWalletRecipient &&
        receiveAmountValue > 0 &&
        !stashedWalletQuote?.formSessionId
      ) {
        showError(peekLastWalletQuoteError() || 'Could not load wallet send quote. Try again.')
        return
      }

      if (
        selectedPaymentMethod === 'balance' &&
        !isEasetagRecipient &&
        !isWalletRecipient &&
        receiveAmountValue > 0 &&
        !isCompletePayoutQuote(stashedQuote)
      ) {
        showError(peekLastPayoutQuoteError() || 'Could not load payout quote. Try again.')
        return
      }
      let calculatedSendingAmount =
        stashedQuote?.noah?.rate && stashedQuote.noah.rate > 0
          ? receiveAmountValue / stashedQuote.noah.rate
          : navAmounts.sendAmount
      const calculatedFeeAmount = 0
      let calculatedTotalAmount =
        stashedQuote?.totalDebited && stashedQuote.totalDebited > 0
          ? stashedQuote.totalDebited
          : calculatedSendingAmount

      if (selectedPaymentMethod === 'balance') {
        const transactionId = generateTransactionId()
        if (stashedWalletQuote) {
          receiveAmountValue = stashedWalletQuote.receiveAmount
          calculatedSendingAmount = stashedWalletQuote.sendAmount
          calculatedTotalAmount = stashedWalletQuote.totalDebited
        } else if (stashedQuote) {
          receiveAmountValue = stashedQuote.receiveAmount
          calculatedSendingAmount =
            stashedQuote.customerPrincipal > 0
              ? stashedQuote.customerPrincipal
              : stashedQuote.sendAmount
          calculatedTotalAmount = stashedQuote.totalDebited
        }

        navigation.navigate('SendConfirm' as never, {
          recipient,
          calculatedSendingAmount,
          calculatedFeeAmount,
          calculatedTotalAmount,
          receiveAmountValue,
          selectedBalanceCurrency,
          receiveCurrency: recipient.currency,
          amountEntryMode: isWalletRecipient ? 'receive' : amountEntryMode,
          amountScreenSendAmount: navAmounts.sendAmount,
          transactionId,
          isWalletSend: Boolean(stashedWalletQuote),
          ...(stashedQuote
            ? {
                pricingQuoteId: stashedQuote.pricingQuoteId,
                pricingQuoteExpiry: stashedQuote.expiresAt,
                pricingQuoteResult: stashedQuote.easner,
              }
            : {}),
          ...(stashedWalletQuote
            ? {
                pricingQuoteId: stashedWalletQuote.pricingQuoteId,
                pricingQuoteExpiry: stashedWalletQuote.expiresAt,
              }
            : {}),
          ...(!isWalletRecipient && note.trim() ? { note: note.trim() } : {}),
          ...(paymentPurpose.trim() ? { paymentPurpose: paymentPurpose.trim() } : {}),
        } as never)
        return
      } else if (
        selectedPaymentMethod === 'otherCurrency' &&
        selectedOtherCurrency &&
        selectedOtherPaymentMethod &&
        showThroughLocalCurrency
      ) {
        const rail = (selectedOtherPaymentMethod === 'mobile_money'
          ? 'mobile_money'
          : 'bank_transfer') as YcPayInRail
        if (rail === 'mobile_money') {
          const payInCountry = residenceCountryFromPayInCurrency(selectedOtherCurrency)
          if (!payInCountry) {
            showError('Could not resolve pay-in country for mobile money.')
            return
          }
          const networksCached = readCachedPayInNetworks(payInCountry, selectedOtherCurrency)
          if (!networksCached?.length) {
            setIsContinuePending(true)
            continueSpinnerTimerRef.current = setTimeout(() => setIsContinueLoading(true), 175)
          }
          try {
            await ensurePayInNetworksCached(payInCountry, selectedOtherCurrency)
          } catch (e) {
            showError(
              e instanceof Error ? e.message : 'Could not load mobile money networks. Try again.',
            )
            return
          } finally {
            if (continueSpinnerTimerRef.current) {
              clearTimeout(continueSpinnerTimerRef.current)
              continueSpinnerTimerRef.current = null
            }
            setIsContinuePending(false)
            setIsContinueLoading(false)
          }
        }
        if (rail === 'bank_transfer') {
          const payInCountry = residenceCountryFromPayInCurrency(selectedOtherCurrency)
          if (!payInCountry) {
            showError('Could not resolve pay-in country for bank transfer.')
            return
          }
          const bankQuoteMeta: CrossBorderQuoteStashMeta = {
            recipientId: recipient.id,
            payInCurrency: selectedOtherCurrency,
            payInCountry,
            payInRail: 'bank_transfer',
            receiveAmount: receiveAmountValue,
          }
          const quoteAlreadyWarm = isStashedCrossBorderQuoteFresh(bankQuoteMeta)
          if (!quoteAlreadyWarm) {
            setIsContinuePending(true)
            continueSpinnerTimerRef.current = setTimeout(() => setIsContinueLoading(true), 175)
          }
          try {
            const quote = await ensureCrossBorderQuoteStashed(bankQuoteMeta)
            if (!isCompleteCrossBorderQuote(quote)) {
              showError(peekLastCrossBorderQuoteError() || 'Could not load cross-border quote. Try again.')
              return
            }
          } finally {
            if (continueSpinnerTimerRef.current) {
              clearTimeout(continueSpinnerTimerRef.current)
              continueSpinnerTimerRef.current = null
            }
            setIsContinuePending(false)
            setIsContinueLoading(false)
          }
        }
        navigation.navigate('SendConfirm' as never, {
          recipient,
          paymentMethod: 'otherCurrency',
          ycPayInCurrency: selectedOtherCurrency,
          ycPayInRail: rail,
          receiveAmountValue,
          receiveCurrency: recipient.currency,
          amountEntryMode,
          amountScreenSendAmount: navAmounts.sendAmount,
          calculatedSendingAmount: sendingAmount,
          calculatedTotalAmount: sendingAmount,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(paymentPurpose.trim() ? { paymentPurpose: paymentPurpose.trim() } : {}),
        } as never)
      }
    } catch (e) {
      console.error('[SendAmount] continue failed:', e)
      showError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      if (continueSpinnerTimerRef.current) {
        clearTimeout(continueSpinnerTimerRef.current)
        continueSpinnerTimerRef.current = null
      }
      setIsContinuePending(false)
      setIsContinueLoading(false)
    }
  }

  const recipientSection = (
    <>
      {recipient ? (
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.recipientBar}
          onPress={() => {
            haptics.tap()
            navigateToSendRecipientHub(navigation, {
              preferredBalanceCurrency: selectedBalanceCurrency,
              selectedPaymentMethod,
              selectedOtherCurrency,
              selectedOtherPaymentMethod,
            })
          }}
        >
          <Text style={styles.recipientLabel}>To:</Text>
          <SendSelectedRecipientSummary recipient={recipient} easenetPreview={easenetDisplay} />
          <RotateCcw
            size={17}
            color={colors.text.primary}
            strokeWidth={2}
            style={styles.changeRecipientIcon}
            accessibilityLabel="Change recipient"
          />
        </Pressable>
      ) : (
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.selectRecipientBox}
          onPress={() => {
            haptics.tap()
            navigateToSendRecipientHub(navigation, {
              preferredBalanceCurrency: selectedBalanceCurrency,
            })
          }}
        >
          <View style={styles.selectRecipientIcon}>
            <User size={20} color={colors.text.secondary} strokeWidth={2} />
          </View>
          <Text style={styles.selectRecipientText}>Select Recipient</Text>
        </Pressable>
      )}

      {recipient && !isEasetagRecipient && !payoutCorridorActive ? (
        <View
          style={{
            marginHorizontal: spacing[4],
            marginBottom: spacing[3],
            padding: spacing[3],
            backgroundColor: colors.warning.background,
            borderRadius: borderRadius.md,
          }}
        >
          <Text style={{ color: colors.warning.dark, fontSize: 14, lineHeight: 20 }}>
            Fiat payouts to this recipient are not available on your account yet (Noah sell channel missing).
            Choose another recipient or a US/EUR bank corridor.
          </Text>
        </View>
      ) : null}
    </>
  )

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? spacing[2] : 0}
        >
          <View style={styles.mainColumn}>
            {/* Header */}
            <Animated.View 
              style={[
                styles.header,
                {
                  opacity: headerAnim,
                  transform: [{
                    translateY: headerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-motion.screenEnterTranslateY, 0],
                    })
                  }]
                }
              ]}
            >
              <Pressable
               android_ripple={ripple.neutral}
                onPress={() => {
                  // Match iOS swipe-back: one pop to recipient hub when it is the previous route; otherwise leave send flow safely.
                  if (navigation.canGoBack()) {
                    navigation.goBack()
                  } else {
                    navigateToSendRecipientHub(navigation, {
                      preferredBalanceCurrency: selectedBalanceCurrency,
                    })
                  }
                }}
                style={styles.backButton}
              >
                <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
              </Pressable>
              <View style={styles.headerContent}>
              <Text style={styles.title}>Send Money</Text>
            </View>
            </Animated.View>

            <Animated.View 
              style={[
                styles.content,
                {
                  opacity: contentAnim,
                  transform: [{
                    translateY: contentAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [motion.screenEnterTranslateY, 0],
                    })
                  }]
                }
              ]}
            >
              <View style={styles.sendFormTop}>
              {recipientSection}

              {/* Amount Display - Wrapped with exchange info */}
              <View style={styles.amountSection}>
                <View style={[styles.amountInputWrapper, { height: amountRowHeight }]}>
                  <View style={styles.amountInputContainer}>
                    <Text
                      style={[
                        styles.amountInput,
                        amountTextStyle,
                        styles.amountUnified,
                        !recipient && styles.amountInputDisabled,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.5}
                      accessibilityRole="text"
                      accessibilityLabel={`Amount ${amountDisplaySymbol}${recipient ? sendAmount : '0'}`}
                    >
                      {wideAmountSymbol && amountPrefixStyle ? (
                        <Text style={amountPrefixStyle}>{amountDisplaySymbol}</Text>
                      ) : (
                        amountDisplaySymbol
                      )}
                      {recipient ? sendAmount : '0'}
                    </Text>
                  </View>
          </View>

                {/* Reserved height: keeps method + note positions stable (same-currency hides copy but not space). */}
                <View style={styles.exchangeInfoSlot}>
                  {!exchangeInfoAmountPositive ? (
                    <Text style={[styles.exchangeInfoText, styles.exchangeInfoPlaceholder]}> </Text>
                  ) : showExchangePreviewSkeleton ? (
                    <SkeletonLoader width={220} height={14} borderRadius={7} />
                  ) : showCrossCurrencyExchangeUi && exchangePreviewReady ? (
                    <View style={styles.exchangeInfoColumn}>
                      <View style={styles.exchangeInfoInline}>
                        <Pressable
                         android_ripple={ripple.neutral}
                          onPress={toggleAmountDirection} style={styles.exchangeToggleTouchArea}
                        >
                          <ArrowUpDown size={13} color={colors.primary.main} strokeWidth={2.5} />
                          <Text style={styles.exchangeInfoText}>
                            {amountEntryMode === 'receive'
                              ? `Sending: ${formatMoneyDisplay(sendingAmount, sendCurrency)}`
                              : `Receiving: ${formatMoneyDisplay(receiveAmount, receiveCurrency)}`}
                          </Text>
                        </Pressable>
                        <Text style={styles.exchangeInfoText}>
                          {' • '}
                          {`Rate: ${formatSendRateLabel(sendCurrency, receiveCurrency, exchangeRate)}`}
                        </Text>
                      </View>
                      {selectedPaymentMethod === 'otherCurrency' &&
                      showThroughLocalCurrency &&
                      amountEntryMode === 'receive' &&
                      sendingAmount > 0 ? (
                        <Text style={styles.exchangeInfoText}>
                          {`You'll pay ~${formatMoneyDisplay(sendingAmount, sendCurrency)}`}
                        </Text>
                      ) : null}
                      {tlcMinHint ? (
                        <Text style={styles.exchangeInfoText}>{tlcMinHint}</Text>
                      ) : null}
                    </View>
                  ) : needsNoahRateForSend && !noahRatesLoading && !hasNoahRateForPair ? (
                    <Text style={[styles.exchangeInfoText, styles.exchangeInfoUnavailable]}>
                      Exchange rate unavailable. Try again shortly.
                    </Text>
                  ) : null}
                </View>
                </View>
              </View>

              {/* Method + note + keypad: pinned above footer on tall screens (no scroll). */}
              <View style={styles.sendMethodNoteKeypadFill}>
              <View style={styles.sendMethodNoteKeypadGroup}>
              {/* Sending Method - Currency Balance Selector (Centered) */}
              <View style={styles.balanceSection}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={[
                    styles.balanceSelector,
                    selectedPaymentMethod === 'balance' &&
                      hasInsufficientBalance &&
                      styles.balanceSelectorInsufficient,
                  ]}
                  onPress={() => {
                    haptics.tap()
                    setShowCurrencyPicker(true)
                  }} >
                  <View style={styles.flagContainer}>
                    {selectedPaymentMethod === 'balance' ? (
                      <CurrencyFlag currency={selectedBalanceCurrency} size={24} style={styles.flagImage} />
                    ) : selectedPaymentMethod === 'otherCurrency' && payInCountry ? (
                      <CountryFlag code={payInCountry} size={24} style={styles.flagImage} />
                    ) : null}
              </View>
                  {selectedPaymentMethod === 'balance' ? (
                    <Text style={styles.balanceSelectorText} numberOfLines={1}>
                      {selectedBalanceCurrency} Balance
                    </Text>
                  ) : (
                    <Text style={styles.balanceSelectorText} numberOfLines={1}>
                      {selectedPaymentMethod === 'otherCurrency' && selectedOtherPaymentMethod
                        ? selectedOtherPaymentMethod === 'mobile_money'
                          ? SEND_LOCAL_PAY_IN_MOMO_CHIP
                          : SEND_LOCAL_PAY_IN_BANK_CHIP
                        : 'Select method'}
                    </Text>
                  )}
                  <ChevronDown size={16} color={colors.text.primary} strokeWidth={2} />
                </Pressable>

          </View>

              {/* Note and Keypad Wrapper */}
              <View style={[styles.noteKeypadWrapper, isWalletRecipient && styles.noteKeypadWrapperCompact]}>
                {!isWalletRecipient && amountFieldMode === 'payment_purpose' ? (
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={styles.noteContainer}
                    onPress={() => setShowPurposePicker(true)}
                  >
                    <MessageSquareText size={18} color={colors.text.secondary} strokeWidth={2} />
                    <Text
                      style={[
                        styles.noteInput,
                        !paymentPurpose && { color: colors.text.secondary },
                      ]}
                      numberOfLines={1}
                    >
                      {paymentPurpose || 'Payment purpose'}
                    </Text>
                    <ChevronDown size={16} color={colors.text.secondary} />
                  </Pressable>
                ) : !isWalletRecipient ? (
                  <View style={styles.noteContainer}>
                    <MessageSquareText size={18} color={colors.text.secondary} strokeWidth={2} />
                    <TextInput
                      style={styles.noteInput}
                      placeholder={noteFieldUi.placeholder}
                      placeholderTextColor={colors.text.secondary}
                      value={note}
                      onChangeText={setNote}
                      multiline={false}
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                  </View>
                ) : null}
                {!isWalletRecipient && amountFieldError ? (
                  <Text style={styles.amountFieldError}>{amountFieldError}</Text>
                ) : null}

                {/* Numeric Keypad - 3x4 grid */}
                <View style={styles.keypadContainer}>
                  <View
                    style={[
                      styles.keypadGrid,
                      { width: keypadSizing.rowWidth, gap: keypadSizing.gap, rowGap: keypadSizing.gap },
                    ]}
                  >
                    {/* Row 1: 1, 2, 3 */}
                    {[1, 2, 3].map((num) => (
                <Pressable
                       android_ripple={ripple.neutral}
                        key={num}
                        style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                        onPress={() => handleKeypadPress(num.toString())}
                        onPressIn={() => haptics.tap()} >
                        <Text style={styles.keypadButtonText}>{num}</Text>
                      </Pressable>
                    ))}
                    {/* Row 2: 4, 5, 6 */}
                    {[4, 5, 6].map((num) => (
                      <Pressable
                       android_ripple={ripple.neutral}
                        key={num}
                        style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                        onPress={() => handleKeypadPress(num.toString())}
                        onPressIn={() => haptics.tap()} >
                        <Text style={styles.keypadButtonText}>{num}</Text>
                      </Pressable>
                    ))}
                    {/* Row 3: 7, 8, 9 */}
                    {[7, 8, 9].map((num) => (
                      <Pressable
                       android_ripple={ripple.neutral}
                        key={num}
                        style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                        onPress={() => handleKeypadPress(num.toString())}
                        onPressIn={() => haptics.tap()} >
                        <Text style={styles.keypadButtonText}>{num}</Text>
                      </Pressable>
                    ))}
                    {/* Row 4: ., 0, backspace */}
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                      onPress={() => handleKeypadPress('.')}
                      onPressIn={() => haptics.tap()} >
                      <Text style={styles.keypadButtonText}>.</Text>
                    </Pressable>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                      onPress={() => handleKeypadPress('0')}
                      onPressIn={() => haptics.tap()} >
                      <Text style={styles.keypadButtonText}>0</Text>
                    </Pressable>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                      onPress={() => handleKeypadPress('backspace')}
                      onPressIn={() => haptics.tap()} disabled={!sendAmount || sendAmount === '0'}
                    >
                      <Delete
                        size={24}
                        color={(!sendAmount || sendAmount === '0') ? colors.text.secondary : colors.text.primary}
                        strokeWidth={2}
                      />
                </Pressable>
              </View>
              </View>
            </View>
              </View>
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>

        <View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height
            if (h > 0 && Math.abs(h - sendFooterHeight) > 1) setSendFooterHeight(h)
          }}
          style={[
            styles.bottomContainer,
            { paddingTop: ctaTopPadding, paddingBottom: footerPadding },
          ]}
        >
          {!tier1Ok ? (
            <Pressable
             android_ripple={ripple.neutral}
              style={styles.verifyInlineCta}
              onPress={() => {
                haptics.tap()
                navigation.navigate('AccountVerification' as never)
              }} accessibilityRole="button"
              accessibilityLabel="Verify identity to unlock banking. Begin."
            >
              <Text style={styles.verifyInlineText}>Verify identity to unlock banking</Text>
              <Text style={styles.verifyInlineLink}>Begin</Text>
            </Pressable>
          ) : null}
          <Pressable
           android_ripple={ripple.neutral}
            style={[styles.sendButton, { marginTop: spacing[2] }, sendButtonDisabled && styles.sendButtonDisabled]}
            onPress={handleSendContinue}
            disabled={sendButtonDisabled}
          >
            <LinearGradient
              colors={sendButtonDisabled ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sendButtonGradient}
            >
              {isContinueLoading ? (
                <ActivityIndicator color={colors.text.inverse} size="small" />
              ) : (
                <Text style={styles.sendButtonText}>
                  {selectedPaymentMethod === 'balance'
                    ? 'Continue'
                    : selectedPaymentMethod === 'otherCurrency' &&
                        selectedOtherCurrency &&
                        selectedOtherPaymentMethod
                      ? 'Authorize'
                      : selectedPaymentMethod
                        ? 'Authorize'
                        : 'Select Method'}
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        {/* Sending Method Modal */}
        <WebAwareModal
          visible={showCurrencyPicker}
          onRequestClose={() => setShowCurrencyPicker(false)}
          nativePanelStyle={{
            height: Math.min(windowHeight * 0.78, 680),
            minHeight: Math.min(windowHeight * 0.58, 520),
            paddingBottom: footerPadding,
          }}
          webPanelStyle={{
            maxHeight: Math.min(windowHeight * 0.78, 680),
            minHeight: Math.min(windowHeight * 0.58, 520),
          }}
        >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>How would you like to send?</Text>
                <Pressable
                 android_ripple={ripple.neutral}
                  onPress={() => {
                    setShowCurrencyPicker(false)
                  }}
                  style={styles.closeButton}
                >
                  <X size={24} color={colors.text.secondary} strokeWidth={2} />
                </Pressable>
      </View>
      
              <ScrollView 
                style={styles.modalScrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
                nestedScrollEnabled={true}
              >
                <View style={styles.currencyListContainer}>
                {/* Send from Balance Section */}
                <View style={styles.paymentSection}>
                  <Text style={styles.paymentSectionTitle}>From Balance</Text>
                  {availableCurrencies.map((item) => {
                    const balance = parseFloat(balances[item.code as 'USD' | 'EUR'] || '0')
                    const showLiveRemaining =
                      selectedPaymentMethod === 'balance' &&
                      balanceDebitEstimate > 0 &&
                      item.code === selectedBalanceCurrency
                    const displayBalance = showLiveRemaining ? balance - balanceDebitEstimate : balance
                    const balanceFormatted = displayBalance.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                    const isSelected = selectedBalanceCurrency === item.code && selectedPaymentMethod === 'balance'
                    return (
                      <Pressable
                       android_ripple={ripple.neutral}
                        key={item.code}
                        style={[
                          styles.currencyItem,
                          isSelected && styles.currencyItemActive
                        ]}
                        onPress={async () => {
                          haptics.tap()
                          setSelectedBalanceCurrency(item.code)
                          setSelectedPaymentMethod('balance')
                          setShowCurrencyPicker(false)
                        }}
                      >
                        <View style={styles.flagContainerSmall}>
                          <CurrencyFlag currency={item.code} size={24} style={styles.flagImageSmall} />
                        </View>
                        <View style={styles.currencyItemInfo}>
                          <Text style={styles.currencyItemCode}>{item.code} Balance</Text>
                          <Text
                            style={[
                              styles.currencyItemBalance,
                              showLiveRemaining && displayBalance < 0 && { color: colors.semantic.destructive },
                            ]}
                          >
                            {item.symbol}{balanceFormatted}
                          </Text>
                        </View>
                        <View style={[
                          styles.checkbox,
                          isSelected && styles.checkboxSelected
                        ]}>
                          {isSelected && (
                            <View style={styles.checkboxInner} />
                          )}
                        </View>
                      </Pressable>
                    )
                  })}
                </View>

                {showThroughLocalCurrency ? (
                <View style={styles.paymentSection}>
                  <Text style={styles.paymentSectionTitle}>Through Local Currency</Text>
                  {payInRailsLoading && localPayInOptions.length === 0 ? (
                    <ActivityIndicator
                      color={colors.primary.main}
                      style={{ marginVertical: spacing[4] }}
                    />
                  ) : null}
                  {localPayInOptions.map((option) => {
                    const isSelected =
                      selectedPaymentMethod === 'otherCurrency' &&
                      selectedOtherCurrency === payInCurrency &&
                      selectedOtherPaymentMethod === option.rail
                    return (
                      <Pressable
                        android_ripple={ripple.neutral}
                        key={option.rail}
                        style={[styles.currencyItem, isSelected && styles.currencyItemActive]}
                        onPress={() => {
                          haptics.tap()
                          if (!payInCurrency) return
                          setSelectedOtherCurrency(payInCurrency)
                          setSelectedOtherPaymentMethod(option.rail)
                          setSelectedPaymentMethod('otherCurrency')
                          setShowCurrencyPicker(false)
                        }}
                      >
                        <View style={styles.flagContainerSmall}>
                          {payInCountry ? (
                            <CountryFlag
                              code={payInCountry}
                              size={24}
                              style={styles.flagImageSmall}
                            />
                          ) : null}
                        </View>
                        <View style={styles.currencyItemInfo}>
                          <Text style={styles.currencyItemCode}>{option.title}</Text>
                        </View>
                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                          {isSelected ? <View style={styles.checkboxInner} /> : null}
                        </View>
                      </Pressable>
                    )
                  })}
                  {!payInRailsLoading && localPayInOptions.length === 0 ? (
                    <Text style={styles.localPayInUnavailable}>
                      Local pay-in is not available for your country right now.
                    </Text>
                  ) : null}
                </View>
                ) : null}
              </View>
              </ScrollView>
        </WebAwareModal>

        <WebAwareModal
          visible={showPurposePicker}
          onRequestClose={() => setShowPurposePicker(false)}
          compact
          nativePanelStyle={{ maxHeight: windowHeight * 0.6, paddingBottom: footerPadding }}
          webPanelStyle={{ maxHeight: windowHeight * 0.6 }}
        >
              <Text style={styles.modalTitle}>Payment purpose</Text>
              <ScrollView keyboardShouldPersistTaps="handled">
                {(payoutHints?.payment_purpose_enum ?? []).map((p) => (
                  <Pressable
                    key={p}
                    android_ripple={ripple.neutral}
                    style={styles.currencyItem}
                    onPress={() => {
                      setPaymentPurpose(p)
                      setShowPurposePicker(false)
                      setAmountFieldError(null)
                    }}
                  >
                    <Text style={styles.currencyItemCode}>{p}</Text>
                  </Pressable>
                ))}
              </ScrollView>
        </WebAwareModal>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  keyboardContainer: {
    flex: 1,
  },
  mainColumn: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    flex: 1,
    justifyContent: 'flex-start',
  },
  sendFormTop: {
    flexShrink: 0,
  },
  /** Fills space under amount so method + keypad sit just above the Send CTA on tall devices. */
  sendMethodNoteKeypadFill: {
    flex: 1,
    justifyContent: 'flex-end',
    width: '100%',
    minHeight: 0,
  },
  sendMethodNoteKeypadGroup: {
    marginTop: 0,
    marginBottom: spacing[2],
    flexShrink: 0,
    width: '100%',
  },
  // Select Recipient Box (when no recipient)
  selectRecipientBox: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: 24 }),
    height: 52,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginBottom: 25,
    gap: spacing[3],
  },
  selectRecipientIcon: {
    ...surfaceChromeCircleStyle(colors, 40, { shadow: 'none' }),
  },
  selectRecipientText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
  },
  // Recipient Bar (when recipient is selected)
  recipientBar: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: 24 }),
    height: 56,
    width: '85%',
    alignSelf: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: 0,
    marginBottom: 25,
    gap: spacing[3],
  },
  recipientLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
  changeRecipientIcon: {
    marginLeft: 'auto',
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
  /** Single-line amount: same rendering path as dashboard balance Text (avoids iOS TextInput clip). */
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
    // Base fontSize - will be overridden by inline style for dynamic sizing
    fontSize: 50,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: fontFamily.black,
    textAlign: 'center',
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    marginVertical: 0,
    flexShrink: 1,
    flexGrow: 0,
    includeFontPadding: false,
    ...Platform.select({
      android: { textAlignVertical: 'center' as const },
      ios: { paddingVertical: 0 },
      default: {},
    }),
  },
  amountInputDisabled: {
    color: colors.text.secondary,
    opacity: 0.6,
  },
  /** Fixed vertical band so same-currency / quote loading does not move method selector or note. */
  exchangeInfoSlot: {
    marginTop: 0,
    minHeight: 58,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
  },
  exchangeInfoColumn: {
    width: '100%',
    alignItems: 'center',
  },
  exchangeQuoteLine: {
    marginTop: 4,
    minHeight: 22,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exchangeQuoteText: {
    textAlign: 'center',
  },
  exchangeInfoPlaceholder: {
    opacity: 0,
  },
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
  /** Balance-only: when debit exceeds available, ring the selector in destructive red. */
  balanceSelectorInsufficient: {
    borderWidth: 1.5,
    borderColor: colors.error.main,
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
  balanceSelectorText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
  balanceText: {
    ...textStyles.bodyMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.medium,
  },
  noteKeypadWrapper: {
    width: '100%',
    marginBottom: 0,
  },
  noteKeypadWrapperCompact: {
    marginTop: spacing[1],
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    paddingHorizontal: spacing[4],
    ...pillRowWrapperStyle,
    gap: spacing[2],
    marginBottom: 20,
  },
  noteInput: {
    ...pillNoteInputStyle,
    color: colors.text.primary,
  },
  amountFieldError: {
    ...textStyles.caption,
    color: colors.error.main,
    marginTop: spacing[1],
    paddingHorizontal: spacing[1],
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
  verifyInlineCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing[1],
    paddingVertical: 0,
    marginBottom: spacing[1],
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
  },
  sendButtonDisabled: {
    opacity: 0.85,
  },
  sendButtonGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    minHeight: 52,
  },
  sendButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    color: '#fff',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingTop: spacing[2],
    ...Platform.select({
      ios: {
        shadowColor: colors.neutral.black,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentSection: {
    marginBottom: spacing[4],
  },
  paymentSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[2],
    marginTop: spacing[2],
    paddingHorizontal: spacing[5],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  localPayInUnavailable: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
  },
  modalScrollView: {
    flex: 1,
    minHeight: 0,
  },
  modalScrollContent: {
    paddingBottom: spacing[4],
    flexGrow: 1,
  },
  currencyListContainer: {
    paddingBottom: spacing[2],
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  currencyItemActive: {
    backgroundColor: colors.primary.main + '10',
  },
  currencyItemInfo: {
    flex: 1,
  },
  currencyItemCode: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: 2,
  },
  currencyItemBalance: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary.main,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background.primary,
  },
  flagContainerSmall: {
    ...surfaceChromeCircleStyle(colors, 24, { shadow: 'none' }),
    overflow: 'hidden',
  },
  flagImageSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
})
