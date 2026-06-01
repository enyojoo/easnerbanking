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
  Modal,
  Keyboard,
  useWindowDimensions,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { MessageSquareText, ChevronDown, User, Coins, RotateCcw, ArrowLeft, ArrowUpDown, Link, Delete, X, ChevronRight } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import ScreenWrapper from '../../components/ScreenWrapper'
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
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { useToast } from '../../components/ToastProvider'
import { useNoahSendExchangeRates, useCryptoSendExchangeRates, useManualSendCatalog, useManualQuote, prefetchNoahSendExchangeRates, prefetchCryptoSendExchangeRates } from '../../hooks/queries'
import { useQueryClient } from '@tanstack/react-query'
import { pickDefaultManualPayInOption } from '@easner/shared'
import { resolveManualPayInNavigation } from '../../lib/manual-send-navigation'
import { useAuth } from '../../contexts/AuthContext'
import { isTier1Complete, TIER2_COMPLETE_PLACEHOLDER } from '../../lib/compliance'
import { generateTransactionId } from '../../lib/transactionId'
import { useBalance } from '../../contexts/BalanceContext'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { CountryFlag } from '../../components/flags/CountryFlag'
import {
  convertNoahSendFlowAmounts,
  exchangeRatesToRateMap,
  getNoahSendConversionRate,
  hasNoahSendRateRow,
  findPayoutFieldsSchema,
  formatSendRateLabel,
  normalizePayoutReceiveAmountForCurrency,
  resolveEffectivePayoutMin,
  resolvePayoutCountryCode,
  getSendAmountNoteFieldUi,
  validatePayoutAmountAgainstLimits,
  validateSendAmountFields,
  validateWalletSendReceiveAmount,
  WALLET_SEND_MIN_RECEIVE_AMOUNT,
} from '@easner/shared'
import { usePayoutMinEnforcement } from '../../hooks/usePayoutMinEnforcement'
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
import { useEasenetRecipientHydration } from '../../hooks/useEasenetRecipientHydration'
import { navigateToSendRecipientHub } from '../../lib/sendFlowNavigation'
import { SendSelectedRecipientSummary } from '../../components/send/SendSelectedRecipientSummary'
import { haptics } from '../../lib/haptics'
import { buildDynamicAmountTextStyle, getDynamicAmountFontSize } from '../../lib/dynamicAmountFontSize'
import { formatSendAgainKeypadAmount } from '../../lib/resolveSendAgainRecipient'
import { getSendAmountFieldSymbol } from '../../lib/sendAmountFieldSymbol'

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

function isManualStablecoinCurrencyCode(code: string): boolean {
  const c = code.trim().toUpperCase()
  return c === 'USDC' || c === 'USDT' || c === 'STABLE'
}

// Landmark/Bank Icon Component
function LandmarkIcon({ size = 24, color = colors.text.primary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10 18v-7"/>
      <Path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/>
      <Path d="M14 18v-7"/>
      <Path d="M18 18v-7"/>
      <Path d="M3 22h18"/>
      <Path d="M6 18v-7"/>
    </Svg>
  )
}

export default function SendAmountScreen({ navigation, route }: NavigationProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const keypadSizing = computeKeypadCellSize(getContentWidth(windowWidth, spacing[5]), {
    gap: spacing[2],
    minSize: 90,
    maxSize: 114,
  })
  const insets = useSafeAreaInsets()
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
    | 'linkBank'
    | 'virtualBank'
    | 'otherCurrency'
    | undefined
  const selectedOtherCurrencyFromRoute = (route.params as any)?.selectedOtherCurrency as string | undefined
  const selectedOtherPaymentMethodFromRoute = (route.params as any)?.selectedOtherPaymentMethod as string | undefined
  const routeParamsRecord = route.params as Record<string, unknown> | undefined
  const isPreferredBalanceCurrency = preferredBalanceCurrencyFromRoute === 'USD' || preferredBalanceCurrencyFromRoute === 'EUR'
  const didInitializeBalanceCurrency = useRef(false)
  const sendAgainPrefillAppliedRef = useRef(false)
  const walletMinSeedAppliedRef = useRef<string | null>(null)
  const [walletQuotePreview, setWalletQuotePreview] = useState<WalletSendQuote | null>(null)
  
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
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'balance' | 'linkBank' | 'virtualBank' | 'otherCurrency'>(
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
  const isWalletRecipientEarly = Boolean(recipient?.wallet_network?.trim())
  const skipNoahExchangeRatesForEasetagP2p =
    isEasetagRecipient &&
    selectedPaymentMethod === 'balance' &&
    String(selectedBalanceCurrency).toUpperCase() === String((recipient?.currency || '').trim().toUpperCase())
  const {
    data: exchangeRatesFromContext = [],
    isFetched: noahRatesFetched,
    isFetching: noahRatesFetching,
  } = useNoahSendExchangeRates(recipient?.currency, {
    enabled: !skipNoahExchangeRatesForEasetagP2p && !isWalletRecipientEarly,
  })
  const {
    data: cryptoRatesFromContext = [],
    isFetched: cryptoRatesFetched,
    isFetching: cryptoRatesFetching,
  } = useCryptoSendExchangeRates(recipient?.currency, recipient?.wallet_network, {
    enabled: isWalletRecipientEarly,
  })

  useEffect(() => {
    if (!recipient?.currency || skipNoahExchangeRatesForEasetagP2p || isWalletRecipientEarly) return
    void prefetchNoahSendExchangeRates(qc, recipient.currency)
  }, [recipient?.currency, skipNoahExchangeRatesForEasetagP2p, isWalletRecipientEarly, qc])

  useEffect(() => {
    if (!isWalletRecipientEarly || !recipient?.currency || !recipient.wallet_network) return
    void prefetchCryptoSendExchangeRates(qc, recipient.currency, recipient.wallet_network)
  }, [isWalletRecipientEarly, recipient?.currency, recipient?.wallet_network, qc])

  // Initialize sending balance currency once:
  // 1) honor incoming preference from prior screen flow, 2) otherwise fallback to available balance.
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

  const payoutRail = recipient && isMobileMoneyRecipient(recipient) ? 'mobile_money' : 'bank_transfer'
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
    receiveCurrency: recipient?.currency,
  })

  const { data: manualCatalog } = useManualSendCatalog(true)
  const manualSendAvailable = (manualCatalog?.sendCurrencies?.length ?? 0) > 0
  /** Easetag P2P is balance-only; manual pay-in rails are not supported. */
  const showManualSendPaymentOptions = manualSendAvailable && !isEasetagRecipient

  const otherCurrencies = useMemo(() => {
    return manualCatalog?.sendCurrencyOptions ?? []
  }, [manualCatalog?.sendCurrencyOptions])

  const paymentMethodIcons: { [key: string]: any } = {
    mtn: require('../../../assets/flags/mtn.png'),
    mpesa: require('../../../assets/flags/mpesa.png'),
    sbp: require('../../../assets/flags/sbp.png'),
  }

  const currencyPaymentMethods = useMemo(() => {
    const by = manualCatalog?.paymentMethodsByCurrency ?? {}
    const out: Record<
      string,
      Array<{ code: string; name: string; type?: string; icon?: string; displayLogoUrl?: string | null }>
    > = {}
    for (const code of manualCatalog?.sendCurrencies ?? []) {
      const opts = by[code] ?? []
      if (opts.length > 0) {
        out[code] = opts.map((o) => ({
          code: o.id,
          name: o.name,
          type: o.type,
          displayLogoUrl: o.display_logo_url,
        }))
      }
    }
    return out
  }, [manualCatalog?.paymentMethodsByCurrency, manualCatalog?.sendCurrencies])

  useEffect(() => {
    if (manualSendAvailable) return
    if (selectedPaymentMethod === 'otherCurrency' || selectedOtherCurrency || selectedOtherPaymentMethod) {
      setSelectedPaymentMethod('balance')
      setSelectedOtherCurrency(null)
      setSelectedOtherPaymentMethod(null)
    }
  }, [manualSendAvailable, selectedPaymentMethod, selectedOtherCurrency, selectedOtherPaymentMethod])

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
    if (selectedPaymentMethod !== 'otherCurrency' || !selectedOtherCurrency) return
    const opts = currencyPaymentMethods[selectedOtherCurrency] ?? []
    if (opts.length === 0) return
    const mapped = opts.map((o) => ({
      id: o.code,
      currency: selectedOtherCurrency,
      name: o.name,
      type: o.type ?? 'bank_account',
      is_default: false,
    }))
    const def = pickDefaultManualPayInOption(
      manualCatalog?.paymentMethodsByCurrency?.[selectedOtherCurrency] ??
        mapped.map((m) => ({ ...m, is_default: false })),
    )
    if (def && !selectedOtherPaymentMethod) {
      setSelectedOtherPaymentMethod(def.id)
    }
  }, [
    selectedPaymentMethod,
    selectedOtherCurrency,
    currencyPaymentMethods,
    manualCatalog,
    selectedOtherPaymentMethod,
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

  const formatCurrency = (amount: number, currency: string): string => {
    const roundedAmount = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100
    const fractionalPart = Math.abs(roundedAmount - Math.trunc(roundedAmount))
    const showDecimals = fractionalPart >= 0.01
    const symbol = currency === 'USD' ? '$' 
      : currency === 'EUR' ? '€' 
      : currency === 'NGN' ? '₦' 
      : currency === 'KES' ? 'KSh' 
      : currency === 'GHS' ? '₵' 
      : currency === 'RUB' ? '₽' 
      : currency === 'GBP' ? '£' 
      : ''
    const formattedAmount = roundedAmount.toLocaleString("en-US", {
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    })
    return symbol ? `${symbol}${formattedAmount}` : `${currency} ${formattedAmount}`
  }

  const toSwitchInputAmount = (amount: number): string => {
    const roundedAmount = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100
    const fractionalPart = Math.abs(roundedAmount - Math.trunc(roundedAmount))
    return fractionalPart >= 0.01 ? roundedAmount.toFixed(2) : String(Math.trunc(roundedAmount))
  }

  const currentBalance = Number.parseFloat(
    String(balances[selectedBalanceCurrency as 'USD' | 'EUR'] || '0').replace(/,/g, ''),
  ) || 0
  const enteredAmount = sendAmount ? Number.parseFloat(sendAmount.replace(/,/g, '')) || 0 : 0
  const receiveCurrency = recipient?.currency || 'EUR'
  const sendCurrency =
    selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency
      ? selectedOtherCurrency
      : selectedBalanceCurrency
  const dynamicAmountFontSize = getDynamicAmountFontSize(sendAmount)
  const dynamicAmountLineHeight = Math.round(dynamicAmountFontSize * 1.12)
  const amountTextBase = buildDynamicAmountTextStyle(textStyles.balanceDisplay, sendAmount)
  const amountDisplayCurrency = amountEntryMode === 'receive' ? receiveCurrency : sendCurrency
  const amountDisplaySymbol = getSendAmountFieldSymbol(
    amountDisplayCurrency || selectedBalanceCurrency,
  )
  const amountTextStyle = {
    ...amountTextBase,
  }
  // Keep the amount band fixed so dynamic number-size changes never push/pull the
  // balance/note/keypad/KYC/CTA group vertically. Tall enough for dynamic headline lineHeight on iOS.
  const amountRowHeight = Math.max(
    Platform.select({ ios: 108, default: 116 }) ?? 116,
    dynamicAmountLineHeight + spacing[2],
  )

  const showCrossCurrencyExchangeUi =
    String(sendCurrency || '').toUpperCase() !== String(receiveCurrency || '').toUpperCase()

  const noahRateMap = useMemo(
    () => exchangeRatesToRateMap(exchangeRatesFromContext),
    [exchangeRatesFromContext],
  )

  const cryptoFxRates = useMemo(
    () =>
      exchangeRatesToRateMap(
        cryptoRatesFromContext.map((r) => ({
          from_currency: r.from_currency,
          to_currency: r.to_currency,
          rate: r.rate,
        })),
      ),
    [cryptoRatesFromContext],
  )

  const isWalletRecipient = Boolean(recipient?.wallet_network?.trim())

  const activeCryptoRateRow = useMemo(() => {
    if (!isWalletRecipient) return null
    const send = String(sendCurrency || '').trim().toUpperCase()
    const receive = String(receiveCurrency || '').trim().toUpperCase()
    const network = String(recipient?.wallet_network || '').trim()
    return (
      cryptoRatesFromContext.find(
        (r) =>
          String(r.from_currency || '').toUpperCase() === send &&
          String(r.to_currency || '').toUpperCase() === receive &&
          String(r.receive_network || '').trim() === network,
      ) ?? null
    )
  }, [
    isWalletRecipient,
    cryptoRatesFromContext,
    sendCurrency,
    receiveCurrency,
    recipient?.wallet_network,
  ])

  const hasNoahRateForPair = useMemo(() => {
    if (isWalletRecipient) return true
    if (!showCrossCurrencyExchangeUi) return true
    const send = String(sendCurrency || '').trim().toUpperCase()
    const receive = String(receiveCurrency || '').trim().toUpperCase()
    if (send === receive) return true
    if (!noahRatesFetched) return false
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
    noahRatesFetched,
    exchangeRatesFromContext,
  ])

  const ratesLoadedForReceiveCurrency = useMemo(() => {
    const receive = String(receiveCurrency || '').trim().toUpperCase()
    if (!receive) return false
    return exchangeRatesFromContext.some(
      (r) => String(r.to_currency || '').toUpperCase() === receive,
    )
  }, [exchangeRatesFromContext, receiveCurrency])

  const manualQuoteEnabled =
    !isEasetagRecipient &&
    selectedPaymentMethod === 'otherCurrency' &&
    !!selectedOtherCurrency &&
    showCrossCurrencyExchangeUi &&
    enteredAmount > 0

  const { data: manualQuote, isFetching: manualQuoteFetching } = useManualQuote({
    enabled: manualQuoteEnabled,
    direction: amountEntryMode,
    amount: enteredAmount,
    fromCurrency: sendCurrency,
    toCurrency: receiveCurrency,
  })

  const needsNoahRateForSend =
    selectedPaymentMethod === 'balance' &&
    !isEasetagRecipient &&
    !isWalletRecipient &&
    showCrossCurrencyExchangeUi

  const needsCryptoRateForSend =
    selectedPaymentMethod === 'balance' &&
    isWalletRecipient &&
    showCrossCurrencyExchangeUi

  const hasValidCryptoRateForPair =
    !needsCryptoRateForSend ||
    (activeCryptoRateRow != null && Number(activeCryptoRateRow.rate) > 0)

  const noahRatesLoading =
    needsNoahRateForSend &&
    !hasNoahRateForPair &&
    (!noahRatesFetched || noahRatesFetching || !ratesLoadedForReceiveCurrency)

  const cryptoRatesLoading =
    needsCryptoRateForSend &&
    !hasValidCryptoRateForPair &&
    (!cryptoRatesFetched || cryptoRatesFetching)

  const manualQuoteLoading = manualQuoteEnabled && !manualQuote && manualQuoteFetching

  const exchangePreviewReady =
    !showCrossCurrencyExchangeUi ||
    (selectedPaymentMethod === 'otherCurrency'
      ? !manualQuoteEnabled || Boolean(manualQuote)
      : isWalletRecipient
        ? !needsCryptoRateForSend || hasValidCryptoRateForPair
        : !needsNoahRateForSend || hasNoahRateForPair)

  const flowAmounts = useMemo(() => {
    if (!showCrossCurrencyExchangeUi || enteredAmount <= 0) {
      return { sendAmount: enteredAmount, receiveAmount: enteredAmount, forwardRate: 1 }
    }
    if (selectedPaymentMethod === 'otherCurrency' && manualQuote) {
      return {
        sendAmount: manualQuote.sendAmount,
        receiveAmount: manualQuote.receiveAmount,
        forwardRate: manualQuote.exchangeRate,
      }
    }
    const previewRateMap = isWalletRecipient ? cryptoFxRates : noahRateMap
    const hasPreviewRate = isWalletRecipient ? hasValidCryptoRateForPair : hasNoahRateForPair
    if (!hasPreviewRate) {
      const fallback = convertNoahSendFlowAmounts({
        direction: amountEntryMode,
        amount: enteredAmount,
        sendCurrency,
        receiveCurrency,
        rateMap: previewRateMap,
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
      rateMap: previewRateMap,
    })
  }, [
    showCrossCurrencyExchangeUi,
    enteredAmount,
    amountEntryMode,
    sendCurrency,
    receiveCurrency,
    noahRateMap,
    cryptoFxRates,
    isWalletRecipient,
    selectedPaymentMethod,
    manualQuote,
    hasNoahRateForPair,
    hasValidCryptoRateForPair,
  ])

  const receiveAmount = normalizePayoutReceiveAmountForCurrency(
    receiveCurrency,
    flowAmounts.receiveAmount,
  )
  const sendingAmount = flowAmounts.sendAmount
  const exchangeRate = flowAmounts.forwardRate

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

  const manualFxRateMap = useMemo(
    () => exchangeRatesToRateMap(manualCatalog?.exchangeRates ?? []),
    [manualCatalog?.exchangeRates],
  )

  const payoutEnforcementRateMap =
    selectedPaymentMethod === 'otherCurrency' ? manualFxRateMap : noahRateMap

  const payoutMinEnforcementEnabled =
    Boolean(recipient) &&
    !isEasetagRecipient &&
    (selectedPaymentMethod === 'balance' ||
      (selectedPaymentMethod === 'otherCurrency' && Boolean(selectedOtherCurrency)))

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
    manualQuote: manualQuote ?? null,
    useManualQuote:
      selectedPaymentMethod === 'otherCurrency' &&
      Boolean(selectedOtherCurrency) &&
      showCrossCurrencyExchangeUi &&
      Boolean(manualQuote),
    onApplyEnteredAmount: (amount) => {
      setSendAmount(formatAmount(amount.toFixed(2)))
    },
  })

  const feeAmount =
    selectedPaymentMethod === 'otherCurrency' && manualQuote ? manualQuote.feeAmount : 0
  const totalAmount =
    selectedPaymentMethod === 'otherCurrency' && manualQuote
      ? manualQuote.totalAmount
      : sendingAmount

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
    if (!recipient) return
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
    (selectedPaymentMethod === 'balance' ||
    selectedPaymentMethod === 'linkBank' ||
    selectedPaymentMethod === 'virtualBank'
      ? !tier1Ok
      : selectedPaymentMethod === 'otherCurrency'
        ? !tier1Ok
        : false)

  const needsBackgroundPayoutQuote =
    selectedPaymentMethod === 'balance' &&
    !isEasetagRecipient &&
    !recipient?.wallet_network?.trim() &&
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
    return [
      recipient.id,
      amountEntryMode,
      amountEntryMode === 'send' ? sendingAmount : receiveAmount,
      selectedBalanceCurrency,
    ].join('|')
  }, [
    needsBackgroundWalletSendQuote,
    recipient?.id,
    amountEntryMode,
    sendingAmount,
    receiveAmount,
    selectedBalanceCurrency,
  ])

  const walletQuoteStashMeta = useMemo(
    () => ({
      recipientId: recipient?.id ?? '',
      amountEntryMode,
      entryAmount: amountEntryMode === 'send' ? sendingAmount : receiveAmount,
      receiveCurrency,
    }),
    [recipient?.id, amountEntryMode, sendingAmount, receiveAmount, receiveCurrency],
  )

  const walletQuoteFresh = isStashedWalletQuoteFresh(walletQuoteStashMeta)

  useEffect(() => {
    if (!walletQuotePrefetchKey || !recipient?.id) return
    let cancelled = false
    void ensureSendWalletQuoteStashed(
      () =>
        noahService.createWalletSendQuote({
          recipientId: recipient!.id,
          sourceBalanceCurrency: selectedBalanceCurrency,
          amountEntryMode,
          ...(amountEntryMode === 'receive' ? { receiveAmount } : {}),
          ...(amountEntryMode === 'send' && sendingAmount > 0 ? { sendAmount: sendingAmount } : {}),
        }),
      walletQuoteStashMeta,
    ).then((quote) => {
      if (!cancelled) setWalletQuotePreview(quote)
    })
    return () => {
      cancelled = true
    }
  }, [
    walletQuotePrefetchKey,
    recipient,
    receiveAmount,
    receiveCurrency,
    selectedBalanceCurrency,
    amountEntryMode,
    sendingAmount,
    walletQuoteStashMeta,
  ])

  useEffect(() => {
    clearSendPayoutQuote()
    clearSendWalletQuote()
    setWalletQuotePreview(null)
    walletMinSeedAppliedRef.current = null
  }, [recipient?.id])

  useEffect(() => {
    if (!recipient?.wallet_network?.trim()) return
    if (selectedPaymentMethod !== 'balance') return
    if (sendAgainPrefillAppliedRef.current) return
    const seedKey = recipient.id
    if (walletMinSeedAppliedRef.current === seedKey) return
    const parsed = sendAmount ? Number.parseFloat(sendAmount.replace(/,/g, '')) || 0 : 0
    if (parsed <= 0) {
      setSendAmount(formatAmount(String(WALLET_SEND_MIN_RECEIVE_AMOUNT)))
    }
    walletMinSeedAppliedRef.current = seedKey
  }, [recipient?.id, recipient?.wallet_network, selectedPaymentMethod, sendAmount])

  const exchangeInfoAmountPositive =
    !!(recipient && sendAmount && Number.parseFloat(sendAmount.replace(/,/g, '')) > 0)

  const sendButtonDisabled =
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
      receiveAmount < WALLET_SEND_MIN_RECEIVE_AMOUNT) ||
    (exchangeInfoAmountPositive && showCrossCurrencyExchangeUi && !exchangePreviewReady)

  const showExchangePreviewSkeleton =
    exchangeInfoAmountPositive &&
    showCrossCurrencyExchangeUi &&
    !exchangePreviewReady &&
    (noahRatesLoading || cryptoRatesLoading || manualQuoteLoading)

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
              {/* Recipient Section */}
              {recipient ? (
                // Selected Recipient View
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
                  }} >
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
                // Select Recipient Box
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.selectRecipientBox}
                  onPress={() => {
                    haptics.tap()
                    navigateToSendRecipientHub(navigation, {
                      preferredBalanceCurrency: selectedBalanceCurrency,
                    })
                  }} >
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
                      {amountDisplaySymbol}
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
                              ? `Sending: ${formatCurrency(sendingAmount, sendCurrency)}`
                              : `Receiving: ${formatCurrency(receiveAmount, receiveCurrency)}`}
                          </Text>
                        </Pressable>
                        <Text style={styles.exchangeInfoText}>
                          {' • '}
                          {`Rate: ${formatSendRateLabel(sendCurrency, receiveCurrency, exchangeRate)}`}
                        </Text>
                      </View>
                    </View>
                  ) : needsCryptoRateForSend && !cryptoRatesLoading && !hasValidCryptoRateForPair ? (
                    <Text style={[styles.exchangeInfoText, styles.exchangeInfoUnavailable]}>
                      Exchange rate unavailable. Try again shortly.
                    </Text>
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
                    ) : selectedPaymentMethod === 'linkBank' ? (
                      <Link size={20} color={colors.text.primary} strokeWidth={2} />
                    ) : selectedPaymentMethod === 'virtualBank' ? (
                      <LandmarkIcon size={20} color={colors.text.primary} />
                    ) : selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency ? (
                      isManualStablecoinCurrencyCode(selectedOtherCurrency) ? (
                          getTokenIconUrl(selectedOtherCurrency) || getTokenIconUrl(selectedOtherPaymentMethod ?? '') ? (
                            <CachedImage
                              uri={
                                getTokenIconUrl(selectedOtherCurrency) ??
                                getTokenIconUrl(selectedOtherPaymentMethod ?? '')!
                              }
                              style={styles.flagImage}
                              contentFit="cover"
                            />
                          ) : (
                            <Coins size={20} color={colors.text.primary} strokeWidth={2} />
                          )
                        )
                        : <CurrencyFlag currency={selectedOtherCurrency} size={24} style={styles.flagImage} />
                    ) : null}
              </View>
                  {selectedPaymentMethod === 'balance' ? (
                    <Text style={styles.balanceSelectorText} numberOfLines={1}>
                      {selectedBalanceCurrency} Balance
                    </Text>
                  ) : (
                    <Text style={styles.balanceSelectorText} numberOfLines={1}>
                      {selectedPaymentMethod === 'linkBank'
                        ? 'Link Bank'
                        : selectedPaymentMethod === 'virtualBank'
                          ? 'Bank Transfer'
                          : selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency && selectedOtherPaymentMethod
                            ? currencyPaymentMethods[selectedOtherCurrency]?.find((m) => m.code === selectedOtherPaymentMethod)
                                ?.name || 'Select Method'
                            : selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency
                              ? `${selectedOtherCurrency} - Select Method`
                              : 'Select Method'}
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

        {/* Fixed footer: stays at screen bottom; KAV shifts the form when the note keyboard is open. */}
        <View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height
            if (h > 0 && Math.abs(h - sendFooterHeight) > 1) setSendFooterHeight(h)
          }}
          style={[
            styles.bottomContainer,
            { paddingTop: ctaTopPadding, paddingBottom: insets.bottom + spacing[4] },
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
            onPress={async () => {
              try {
              const enteredAmountValue = Number.parseFloat(sendAmount.replace(/,/g, ''))
              if (!sendAmount || sendAmount === '0' || enteredAmountValue <= 0 || !recipient || !selectedPaymentMethod) return

              // For otherCurrency, require both currency and payment method selection
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

              const navRateMap = isWalletRecipient ? cryptoFxRates : noahRateMap
              const navAmounts =
                sendCurrency !== receiveCurrency
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
              let receiveAmountValue = normalizePayoutReceiveAmountForCurrency(
                receiveCurrency,
                navAmounts.receiveAmount,
              )
              const quoteStashMeta = {
                recipientId: recipient.id,
                amountEntryMode,
                entryAmount: amountEntryMode === 'send' ? navAmounts.sendAmount : receiveAmountValue,
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
                const limitCheck = validatePayoutAmountAgainstLimits({
                  amount: receiveAmountValue,
                  hints: payoutHints,
                  currencyCode: receiveCurrency,
                  rail: payoutRail,
                })
                if (!limitCheck.ok) {
                  setAmountFieldError(limitCheck.message)
                  showError(limitCheck.message)
                  return
                }
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
                          amountEntryMode,
                          ...(amountEntryMode === 'receive' ? { receiveAmount: receiveAmountValue } : {}),
                          ...(amountEntryMode === 'send' && navAmounts.sendAmount > 0
                            ? { sendAmount: navAmounts.sendAmount }
                            : {}),
                        }),
                      quoteStashMeta,
                    )
                  : isStashedWalletQuoteFresh(quoteStashMeta)
                    ? peekSendWalletQuote()
                    : null

              const stashedQuote =
                selectedPaymentMethod === 'balance' &&
                !isEasetagRecipient &&
                !recipient?.wallet_network?.trim() &&
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
                showError(
                  peekLastWalletQuoteError() || 'Could not load wallet send quote. Try again.',
                )
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
                  amountEntryMode,
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
              }

              if (selectedPaymentMethod === 'linkBank') {
                // Generate Transaction ID (same format as web app)
                const transactionId = generateTransactionId()
                navigation.navigate('OpenBanking' as never, {
                  transactionId: transactionId,
                  sendAmount: calculatedSendingAmount,
                  receiveAmount: receiveAmountValue,
                  sendCurrency: selectedBalanceCurrency,
                  receiveCurrency: recipient.currency,
                  recipient: recipient,
                  feeAmount: calculatedFeeAmount,
                  totalAmount: calculatedTotalAmount,
                } as never)
              } else if (selectedPaymentMethod === 'virtualBank') {
                // Generate Transaction ID (same format as web app)
                const transactionId = generateTransactionId()
                navigation.navigate('VirtualBankAccount' as never, {
                  transactionId: transactionId,
                  sendAmount: calculatedSendingAmount,
                  receiveAmount: receiveAmountValue,
                  sendCurrency: selectedBalanceCurrency,
                  receiveCurrency: recipient.currency,
                  recipient: recipient,
                  feeAmount: calculatedFeeAmount,
                  totalAmount: calculatedTotalAmount,
                } as never)
              } else if (selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency && selectedOtherPaymentMethod) {
                const transactionId = generateTransactionId()
                const pmOption =
                  manualCatalog?.paymentMethodsByCurrency?.[selectedOtherCurrency]?.find(
                    (o) => o.id === selectedOtherPaymentMethod,
                  ) ??
                  currencyPaymentMethods[selectedOtherCurrency]?.find(
                    (m) => m.code === selectedOtherPaymentMethod,
                  )
                const pmType =
                  pmOption && 'type' in pmOption
                    ? String((pmOption as { type?: string }).type ?? '')
                    : ''
                const screen =
                  manualCatalog && pmType
                    ? resolveManualPayInNavigation(pmType)
                    : selectedOtherPaymentMethod === 'sbp'
                      ? 'OpenBanking'
                      : selectedOtherPaymentMethod === 'bankTransfer'
                        ? 'VirtualBankAccount'
                        : 'MobileMoney'
                navigation.navigate(screen as never, {
                  transactionId,
                  sendAmount: calculatedSendingAmount,
                  receiveAmount: receiveAmountValue,
                  sendCurrency,
                  receiveCurrency: recipient.currency,
                  recipient,
                  paymentMethodId: selectedOtherPaymentMethod,
                  feeAmount: calculatedFeeAmount,
                  totalAmount: calculatedTotalAmount,
                  manualQuote: manualQuote ?? null,
                } as never)
              }
              } catch (e) {
                console.error('[SendAmount] continue failed:', e)
                showError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
              }
            }}
            disabled={sendButtonDisabled}
          >
            <LinearGradient
              colors={sendButtonDisabled ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sendButtonGradient}
            >
              <Text style={styles.sendButtonText}>
                {selectedPaymentMethod === 'balance'
                  ? 'Continue'
                  : selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency && selectedOtherPaymentMethod
                    ? 'Authorize'
                    : selectedPaymentMethod
                      ? 'Authorize'
                      : 'Select Method'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* Sending Method Modal */}
        <Modal
          visible={showCurrencyPicker}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowCurrencyPicker(false)
          }}
        >
          <View style={styles.modalOverlay}>
            <Pressable
             android_ripple={ripple.neutral}
              style={StyleSheet.absoluteFill} onPress={() => setShowCurrencyPicker(false)}
            />
            <View style={[styles.modalContainer, { 
              height: Math.min(windowHeight * 0.78, 680),
              minHeight: Math.min(windowHeight * 0.58, 520),
              paddingBottom: Math.max(insets.bottom, 20),
            }]} onStartShouldSetResponder={() => true} onResponderGrant={() => {}}>
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

                {showManualSendPaymentOptions ? (
                <View style={styles.paymentSection}>
                  <Text style={styles.paymentSectionTitle}>Through Another Currency</Text>
                  
                  {/* Currency Selector */}
                  {!selectedOtherCurrency ? (
                    otherCurrencies.map((currency) => (
                      <Pressable
                       android_ripple={ripple.neutral}
                        key={currency.code}
                        style={styles.currencyItem}
                        onPress={async () => {
                          haptics.tap()
                          setSelectedOtherCurrency(currency.code)
                          setSelectedPaymentMethod('otherCurrency')
                          setSelectedOtherPaymentMethod(null)
                        }}
                      >
                        <View style={styles.flagContainerSmall}>
                          {getTokenIconUrl(currency.code) ? (
                            <CachedImage
                              uri={getTokenIconUrl(currency.code)!}
                              style={styles.flagImageSmall}
                              contentFit="cover"
                            />
                          ) : (
                            <CurrencyFlag currency={currency.code} size={24} style={styles.flagImageSmall} />
                          )}
                        </View>
                        <View style={styles.currencyItemInfo}>
                          <Text style={styles.currencyItemCode}>{currency.name}</Text>
                        </View>
                        <ChevronRight size={20} color={colors.text.secondary} strokeWidth={2} />
                      </Pressable>
                    ))
                  ) : (
                    <>
                      {/* Back button to change currency */}
                      <Pressable
                       android_ripple={ripple.neutral}
                        style={styles.currencyItem}
                        onPress={async () => {
                          haptics.tap()
                          setSelectedOtherCurrency(null)
                          setSelectedOtherPaymentMethod(null)
                        }}
                      >
                        <ArrowLeft size={20} color={colors.primary.main} strokeWidth={2} />
                        <View style={styles.currencyItemInfo}>
                          <Text style={styles.currencyItemCode}>
                            {otherCurrencies.find(c => c.code === selectedOtherCurrency)?.name}
                          </Text>
                        </View>
                      </Pressable>

                      {/* Payment Methods for Selected Currency */}
                      {currencyPaymentMethods[selectedOtherCurrency]?.map((method) => {
                        const isSelected = selectedOtherPaymentMethod === method.code
                        return (
                          <Pressable
                           android_ripple={ripple.neutral}
                            key={method.code}
                            style={[
                              styles.currencyItem,
                              isSelected && styles.currencyItemActive
                            ]}
                            onPress={async () => {
                              haptics.tap()
                              setSelectedOtherPaymentMethod(method.code)
                              setShowCurrencyPicker(false)
                            }}
                          >
                            <View style={styles.flagContainerSmall}>
                              {method.displayLogoUrl ? (
                                <CachedImage
                                  uri={method.displayLogoUrl}
                                  style={styles.flagImageSmall}
                                  contentFit="contain"
                                />
                              ) : isManualStablecoinCurrencyCode(selectedOtherCurrency) ? (
                                getTokenIconUrl(selectedOtherCurrency) || getTokenIconUrl(method.code) ? (
                                  <CachedImage
                                    uri={
                                      getTokenIconUrl(selectedOtherCurrency) ??
                                      getTokenIconUrl(method.code)!
                                    }
                                    style={styles.flagImageSmall}
                                    contentFit="cover"
                                  />
                                ) : (
                                  <Coins size={16} color={colors.text.primary} strokeWidth={2} />
                                )
                              ) : method.icon && paymentMethodIcons[method.icon] ? (
                                <CachedImage
                                  source={paymentMethodIcons[method.icon]}
                                  style={styles.flagImageSmall}
                                  contentFit="cover"
                                  prefetch={false}
                                />
                              ) : (
                                <LandmarkIcon size={16} color={colors.text.primary} />
                              )}
                            </View>
                            <View style={styles.currencyItemInfo}>
                              <Text style={styles.currencyItemCode}>{method.name}</Text>
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
                    </>
                  )}
                </View>
                ) : null}
              </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showPurposePicker}
          animationType="fade"
          transparent
          onRequestClose={() => setShowPurposePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              android_ripple={ripple.neutral}
              style={StyleSheet.absoluteFill}
              onPress={() => setShowPurposePicker(false)}
            />
            <View style={[styles.modalContainer, { maxHeight: windowHeight * 0.6, paddingBottom: insets.bottom }]}>
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
            </View>
          </View>
        </Modal>
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
    ...Platform.select({
      android: {
        height: 44,
        paddingVertical: 0,
      },
      ios: {
        paddingVertical: spacing[3],
      },
    }),
    gap: spacing[2],
    marginBottom: 20,
  },
  noteInput: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlignVertical: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
        paddingVertical: 0,
      },
    }),
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
