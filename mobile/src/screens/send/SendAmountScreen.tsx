import React, { useState, useRef, useEffect } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Modal,
  Image,
  Keyboard,
  useWindowDimensions,
} from 'react-native'
import { MessageSquareText, ChevronDown, User, Coins, RotateCcw, ArrowLeft, ArrowUpDown, Link, Delete, X, ChevronRight } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import ScreenWrapper from '../../components/ScreenWrapper'
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
import { useExchangeRatesList } from '../../hooks/queries'
import { useAuth } from '../../contexts/AuthContext'
import { isTier1Complete, TIER2_COMPLETE_PLACEHOLDER } from '../../lib/compliance'
import { mobileFxEngine } from '../../lib/fxEngine'
import { generateTransactionId } from '../../lib/transactionId'
import { useBalance } from '../../contexts/BalanceContext'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { CountryFlag } from '../../components/flags/CountryFlag'
import { getCountryCodeForCurrency } from '@easner/shared'
import { noahService, type PricingQuote } from '../../lib/noahService'
import { getWalletAssets } from '../../lib/recipientCatalog'
import { getPayoutCorridorCache, isRecipientPayoutCorridorActive, refreshPayoutCorridors } from '../../lib/payoutCorridors'
import { getTokenIconUrl } from '../../lib/cryptoIcons'
import type { Recipient } from '../../types'
import {
  EasenetSubtitleRow,
  isEasenetRecipientRecord,
  PayoutSubtitleRow,
  resolveRecipientEasetagForUi,
} from '../../lib/easenetRecipientUi'
import { getPayoutRecipientSubtitleParts, isMobileMoneyRecipient } from '../../lib/recipientPayoutPreview'
import { useEasenetRecipientHydration, type HydratedEasenetProfile } from '../../hooks/useEasenetRecipientHydration'
import { navigateToSendRecipientHub } from '../../lib/sendFlowNavigation'
import { avatarImageSource } from '../../lib/avatarCache'

function inferCountryFromRecipientCurrency(currency: string): string | undefined {
  const m: Record<string, string> = {
    KES: 'KE',
    GHS: 'GH',
    NGN: 'NG',
    ZAR: 'ZA',
  }
  return m[currency.toUpperCase()]
}

function normalizePayoutMethodForPricing(methodCode: string | undefined | null): string | undefined {
  if (!methodCode) return undefined
  const x = methodCode.toLowerCase()
  if (x === 'mpesa' || x === 'm-pesa') return 'mobile_money_mpesa'
  if (x === 'banktransfer' || x === 'bank_transfer') return 'bank_transfer'
  if (x === 'mtnmomo' || x === 'mtn_momo') return 'mobile_money_mtn'
  if (x === 'sbp') return 'sbp'
  return methodCode
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
  const noahKycStatus =
    userProfile?.noah_kyc_status ??
    (userProfile as { noah_kyc_status?: string; profile?: { noah_kyc_status?: string } })?.profile?.noah_kyc_status
  const { data: exchangeRatesFromContext = [] } = useExchangeRatesList()
  const { balances, refreshBalances } = useBalance()
  // Ensure exchangeRates is always an array (fallback to empty array if undefined)
  const exchangeRates = exchangeRatesFromContext || []
  
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
  const isPreferredBalanceCurrency = preferredBalanceCurrencyFromRoute === 'USD' || preferredBalanceCurrencyFromRoute === 'EUR'
  const didInitializeBalanceCurrency = useRef(false)
  
  // UI State only - no backend integration
  const [recipient, setRecipient] = useState<Recipient | null>(recipientFromRoute || null)
  const easenetDisplay = useEasenetRecipientHydration(recipient)
  /** Internal Easetag P2P does not use fiat payout corridors — don’t block the CTA on corridor status. */
  const easetagUi = recipient ? resolveRecipientEasetagForUi(recipient).trim() : ''
  const isEasetagRecipient = easetagUi.length > 0
  const [payoutCorridorActive, setPayoutCorridorActive] = useState(true)
  const [sendAmount, setSendAmount] = useState('0')
  const [note, setNote] = useState('')
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
  const [amountEntryMode, setAmountEntryMode] = useState<'receive' | 'send'>('receive')
  const [pricingPreviewQuote, setPricingPreviewQuote] = useState<PricingQuote | null>(null)

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

  // Available options for "Through Another Currency"
  const otherCurrencies = [
    { code: 'STABLE', name: 'Stablecoin', symbol: '' },
    { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
    { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵' },
  ]
  const stablecoinAssets = getWalletAssets()

  // Payment method icons mapping
  const paymentMethodIcons: { [key: string]: any } = {
    mtn: require('../../../assets/flags/mtn.png'),
    mpesa: require('../../../assets/flags/mpesa.png'),
    sbp: require('../../../assets/flags/sbp.png'),
  }

  // Payment methods for each currency
  const currencyPaymentMethods: { [key: string]: Array<{ code: string; name: string; icon?: string }> } = {
    STABLE: stablecoinAssets.map((asset) => ({ code: asset, name: asset })),
    GHS: [
      { code: 'bankTransfer', name: 'Bank Transfer' },
      { code: 'mtnMomo', name: 'MTN MOMO', icon: 'mtn' },
    ],
    KES: [
      { code: 'mpesa', name: 'M-Pesa', icon: 'mpesa' },
      { code: 'bankTransfer', name: 'Bank Transfer' },
    ],
  }

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
      const params = route.params as any
      if (params?.recipient) {
        // Update recipient immediately for smooth transition
        setRecipient(params.recipient)
      }
      if (params?.selectedPaymentMethod) {
        setSelectedPaymentMethod(params.selectedPaymentMethod)
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

  const getInitials = (fullName: string) => {
    const parts = fullName.trim().split(' ').filter(Boolean)
    if (parts.length === 0) return '??'
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

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

  // Calculate dynamic font size based on amount length (like Cash App/Revolut)
  const getDynamicFontSize = (amount: string): number => {
    // Remove commas and get the length of the numeric part
    const numericLength = amount.replace(/,/g, '').replace(/\./g, '').length
    
    // Minimum font size to ensure readability
    const minSize = 28
    
    // Specific font sizes based on digit count
    let fontSize: number
    if (numericLength <= 5) {
      fontSize = 65
    } else if (numericLength === 6) {
      fontSize = 55
    } else if (numericLength === 7 || numericLength === 8) {
      fontSize = 50
    } else {
      // For 9 digits and above, scale down by 5px per digit over 8
      // 9 digits = 45px, 10 digits = 40px, etc.
      fontSize = 50 - ((numericLength - 8) * 5)
    }
    
    // Ensure we don't go below minimum
    fontSize = Math.max(fontSize, minSize)
    
    return fontSize
  }

  // Keypad handlers - natural typing with optional decimal mode.
  const handleKeypadPress = (value: string) => {
    if (!recipient) return // Disabled until recipient is selected
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

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

  const getCurrencySymbol = (currency: string): string => {
    return currency === 'USD' ? '$' 
      : currency === 'EUR' ? '€' 
      : currency === 'NGN' ? '₦' 
      : currency === 'KES' ? 'KSh' 
      : currency === 'GHS' ? '₵' 
      : currency === 'RUB' ? '₽' 
      : currency === 'GBP' ? '£' 
      : currency
  }

  const currentBalance = Number.parseFloat(
    String(balances[selectedBalanceCurrency as 'USD' | 'EUR'] || '0').replace(/,/g, ''),
  ) || 0
  const enteredAmount = sendAmount ? Number.parseFloat(sendAmount.replace(/,/g, '')) || 0 : 0
  const receiveCurrency = recipient?.currency || 'EUR'
  const sendCurrency = selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency
    ? selectedOtherCurrency === 'STABLE'
      ? (selectedOtherPaymentMethod?.toUpperCase() || selectedBalanceCurrency)
      : selectedOtherCurrency
    : selectedBalanceCurrency
  const dynamicAmountFontSize = getDynamicFontSize(sendAmount)
  const dynamicAmountLineHeight = Math.round(dynamicAmountFontSize * 1.12)
  const amountTextBase = {
    ...textStyles.balanceDisplay,
    fontSize: dynamicAmountFontSize,
    lineHeight: dynamicAmountLineHeight,
    includeFontPadding: false as const,
    paddingVertical: 0,
    marginVertical: 0,
  }
  const amountDisplayCurrency = amountEntryMode === 'receive' ? receiveCurrency : sendCurrency
  const amountDisplaySymbolRaw = getCurrencySymbol(amountDisplayCurrency)
  const amountDisplaySymbol =
    (typeof amountDisplaySymbolRaw === 'string' && amountDisplaySymbolRaw.trim().length > 0
      ? amountDisplaySymbolRaw
      : String(amountDisplayCurrency || '').trim()) || getCurrencySymbol(selectedBalanceCurrency)
  const amountAssetIconUrl = getTokenIconUrl(String(amountDisplayCurrency || '').toUpperCase()) || null
  const showAmountAssetIcon = Boolean(amountAssetIconUrl && amountDisplaySymbol.length > 2)
  const prefixLineHeight =
    amountDisplaySymbol.length > 2
      ? Math.max(Math.round(dynamicAmountLineHeight * 0.55), 22)
      : dynamicAmountLineHeight
  /** One Text line like Dashboard — avoids Text vs TextInput baseline mismatch for $ / € / £. */
  const unifiedShortAmountText =
    !showAmountAssetIcon && amountDisplaySymbol.length <= 2
  const amountTextStyle = {
    ...amountTextBase,
  }
  const amountPrefixStyle = {
    ...amountTextBase,
    fontSize:
      amountDisplaySymbol.length > 2
        ? Math.max(Math.round(dynamicAmountFontSize * 0.52), 20)
        : dynamicAmountFontSize,
    lineHeight: prefixLineHeight,
  }
  // Keep the amount band fixed so dynamic number-size changes never push/pull the
  // balance/note/keypad/KYC/CTA group vertically.
  const amountRowHeight = Platform.select({
    ios: 108,
    default: 116,
  })

  const showCrossCurrencyExchangeUi =
    String(sendCurrency || '').toUpperCase() !== String(receiveCurrency || '').toUpperCase()

  // Get exchange rate using FX Engine (with safety check)
  const rateData = exchangeRates && Array.isArray(exchangeRates) && exchangeRates.length > 0
    ? mobileFxEngine.getRate(exchangeRates, sendCurrency, receiveCurrency)
    : null
  const exchangeRate = rateData?.rate || 1
  const reverseExchangeRate = exchangeRate > 0 ? 1 / exchangeRate : 0
  
  // Calculate order amounts using FX Engine.
  // receiveAmount is payout currency amount; sendingAmount is funding currency amount.
  let receiveAmount = 0
  let sendingAmount = 0
  let feeAmount = 0
  let totalAmount = 0

  if (amountEntryMode === 'receive') {
    receiveAmount = enteredAmount
  } else if (sendCurrency !== receiveCurrency) {
    receiveAmount = reverseExchangeRate > 0 ? enteredAmount / reverseExchangeRate : enteredAmount * exchangeRate
  } else {
    receiveAmount = enteredAmount
  }
  
  if (recipient && receiveAmount > 0 && sendCurrency !== receiveCurrency && rateData && exchangeRates && Array.isArray(exchangeRates)) {
    try {
      const orderAmounts = mobileFxEngine.calculateOrderAmounts(
        receiveAmount,
        sendCurrency,
        receiveCurrency,
        exchangeRates
      )
      sendingAmount = orderAmounts.sendAmount
      feeAmount = orderAmounts.feeAmount
      totalAmount = orderAmounts.totalAmount
    } catch (error) {
      console.error('Error calculating order amounts:', error)
      // Fallback to simple calculation if FX engine fails
      sendingAmount = receiveAmount / exchangeRate
    }
  } else if (receiveAmount > 0 && sendCurrency !== receiveCurrency) {
    // Fallback calculation if no rate data
    sendingAmount = receiveAmount / exchangeRate
  } else if (receiveAmount > 0) {
    sendingAmount = receiveAmount
  }

  /** Debit from wallet when paying from balance (includes fees when FX order amounts are available). */
  const balanceDebitEstimate =
    selectedPaymentMethod === 'balance' && recipient && receiveAmount > 0
      ? totalAmount > 0
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
  const keypadToCtaGap = showVerificationNotice ? spacing[2] : spacing[1]
  const ctaTopPadding = showVerificationNotice ? spacing[2] : spacing[2]
  const verificationBlocksSend =
    receiveAmount > 0 &&
    (selectedPaymentMethod === 'balance' ||
    selectedPaymentMethod === 'linkBank' ||
    selectedPaymentMethod === 'virtualBank'
      ? !tier1Ok
      : selectedPaymentMethod === 'otherCurrency'
        ? !tier2Ok
        : false)

  const sendButtonDisabled =
    !sendAmount ||
    sendAmount === '0.00' ||
    Number.parseFloat(sendAmount.replace(/,/g, '')) <= 0 ||
    !recipient ||
    (!isEasetagRecipient && !payoutCorridorActive) ||
    !selectedPaymentMethod ||
    (selectedPaymentMethod === 'otherCurrency' && (!selectedOtherCurrency || !selectedOtherPaymentMethod)) ||
    verificationBlocksSend ||
    hasInsufficientBalance

  useEffect(() => {
    let cancelled = false
    const entered = Number.parseFloat(sendAmount.replace(/,/g, '') || '0')
    if (
      !tier1Ok ||
      !recipient ||
      entered <= 0 ||
      !selectedPaymentMethod ||
      (selectedPaymentMethod === 'otherCurrency' && (!selectedOtherCurrency || !selectedOtherPaymentMethod)) ||
      receiveAmount <= 0 ||
      sendingAmount <= 0
    ) {
      setPricingPreviewQuote(null)
      return
    }
    if (!showCrossCurrencyExchangeUi) {
      setPricingPreviewQuote(null)
      return
    }
    if (!exchangeRates || exchangeRates.length === 0) {
      setPricingPreviewQuote(null)
      return
    }

    const t = setTimeout(() => {
      void (async () => {
        try {
          const payoutMethodForQuote =
            selectedPaymentMethod === 'otherCurrency'
              ? normalizePayoutMethodForPricing(selectedOtherPaymentMethod)
              : undefined
          const quote = await noahService.createPricingQuote({
            sourceCurrency: sendCurrency,
            destinationCurrency: recipient.currency,
            sourceAmount: sendingAmount,
            rail:
              selectedPaymentMethod === 'balance'
                ? 'wallet'
                : selectedPaymentMethod === 'otherCurrency'
                  ? selectedOtherPaymentMethod || undefined
                  : selectedPaymentMethod,
            countryCode: recipient.country_code,
            payoutCountry: recipient.country_code || inferCountryFromRecipientCurrency(recipient.currency),
            payoutMethod: payoutMethodForQuote,
          })
          if (!cancelled) setPricingPreviewQuote(quote)
        } catch {
          if (!cancelled) setPricingPreviewQuote(null)
        }
      })()
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [
    tier1Ok,
    recipient?.id,
    recipient?.currency,
    recipient?.country_code,
    sendAmount,
    sendCurrency,
    receiveCurrency,
    selectedPaymentMethod,
    selectedOtherCurrency,
    selectedOtherPaymentMethod,
    sendingAmount,
    receiveAmount,
    exchangeRates,
    showCrossCurrencyExchangeUi,
  ])

  const exchangeInfoAmountPositive =
    !!(recipient && sendAmount && Number.parseFloat(sendAmount.replace(/,/g, '')) > 0)

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.scrollView}>
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
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    navigateToSendRecipientHub(navigation, {
                      preferredBalanceCurrency: selectedBalanceCurrency,
                      selectedPaymentMethod,
                      selectedOtherCurrency,
                      selectedOtherPaymentMethod,
                    })
                  }} >
                  <Text style={styles.recipientLabel}>To:</Text>
                  <SendRecipientAvatar recipient={recipient} getInitials={getInitials} easenetPreview={easenetDisplay} />
                  <View style={styles.recipientInfo}>
                    <Text style={styles.recipientName} numberOfLines={1} ellipsizeMode="tail">
                      {isEasenetRecipientRecord(recipient) ? easenetDisplay.fullName : recipient.full_name}
                    </Text>
                    {isEasenetRecipientRecord(recipient) ? (
                      <EasenetSubtitleRow
                        easetag={resolveRecipientEasetagForUi(recipient)}
                        accountKind={easenetDisplay.accountKind}
                        textStyle={styles.recipientDetails}
                        gap={4}
                      />
                    ) : (
                      <PayoutSubtitleRow
                        {...getPayoutRecipientSubtitleParts(recipient)}
                        textStyle={styles.recipientDetails}
                        gap={4}
                      />
                    )}
                  </View>
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
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
                    This recipient&apos;s payout corridor is temporarily unavailable. Choose another recipient or try again
                    later.
                  </Text>
                </View>
              ) : null}

              {/* Amount Display - Wrapped with exchange info */}
              <View style={styles.amountSection}>
                <View style={[styles.amountInputWrapper, { height: amountRowHeight }]}>
                  <View style={styles.amountInputContainer}>
                    {unifiedShortAmountText ? (
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
                    ) : (
                      <>
                        {recipient &&
                          (showAmountAssetIcon ? (
                            <View style={styles.amountAssetIconWrap}>
                              <Image
                                source={{ uri: amountAssetIconUrl! }}
                                style={styles.amountAssetIcon}
                                resizeMode="cover"
                              />
                            </View>
                          ) : (
                            <Text style={[styles.currencyPrefix, amountPrefixStyle]} numberOfLines={1}>
                              {amountDisplaySymbol}
                            </Text>
                          ))}
                        <TextInput
                          style={[
                            styles.amountInput,
                            !recipient && styles.amountInputDisabled,
                            amountTextStyle,
                          ]}
                          value={recipient ? sendAmount : '0'}
                          onChangeText={(text) => {
                            if (!recipient) return

                            let cleaned = text.replace(/,/g, '').replace(/[^0-9.]/g, '')
                            const formatted = formatAmount(cleaned)
                            setSendAmount(formatted)
                          }}
                          placeholder="0"
                          placeholderTextColor={colors.text.secondary}
                          keyboardType="numeric"
                          editable={!!recipient}
                          autoFocus={false}
                          showSoftInputOnFocus={false}
                          underlineColorAndroid="transparent"
                        />
                      </>
                    )}
                  </View>
          </View>

                {/* Reserved height: keeps method + note positions stable (same-currency hides copy but not space). */}
                <View style={styles.exchangeInfoSlot}>
                  {!exchangeInfoAmountPositive ? (
                    <Text style={[styles.exchangeInfoText, styles.exchangeInfoPlaceholder]}> </Text>
                  ) : showCrossCurrencyExchangeUi ? (
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
                          {amountEntryMode === 'receive'
                            ? `Rate: 1 ${sendCurrency} = ${exchangeRate.toFixed(2)} ${receiveCurrency}`
                            : `Rate: 1 ${receiveCurrency} = ${reverseExchangeRate.toFixed(4)} ${sendCurrency}`}
                        </Text>
                      </View>
                      <View style={styles.exchangeQuoteLine}>
                        {pricingPreviewQuote?.pricingTotals ? (
                          <Text
                            style={[styles.exchangeInfoText, styles.exchangeQuoteText]}
                            numberOfLines={2}
                            ellipsizeMode="tail"
                          >
                            Live quote: 1 {sendCurrency} = {Number(pricingPreviewQuote.effectiveRate).toFixed(4)}{' '}
                            {receiveCurrency} · Fees{' '}
                            {formatCurrency(pricingPreviewQuote.pricingTotals.total_user_fee, sendCurrency)} · Recipient{' '}
                            {formatCurrency(pricingPreviewQuote.pricingTotals.total_recipient_amount, receiveCurrency)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                </View>
                </View>
              </View>

              {/* Method + note + keypad: stacked under exchange row (tight gap); space below group stays inside KAV above bottomContainer. */}
              <View style={[styles.sendMethodNoteKeypadGroup, { marginBottom: keypadToCtaGap }]}>
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
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
                      selectedOtherCurrency === 'STABLE'
                        ? (
                          selectedOtherPaymentMethod && getTokenIconUrl(selectedOtherPaymentMethod) ? (
                            <Image
                              source={{ uri: getTokenIconUrl(selectedOtherPaymentMethod)! }}
                              style={styles.flagImage}
                              resizeMode="cover"
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
              <View style={styles.noteKeypadWrapper}>
                {/* Note Field */}
                <View style={styles.noteContainer}>
                  <MessageSquareText size={18} color={colors.text.secondary} strokeWidth={2} />
              <TextInput
                    style={styles.noteInput}
                    placeholder="Note"
                    placeholderTextColor={colors.text.secondary}
                    value={note}
                    onChangeText={setNote}
                    multiline={false}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
                
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
                        onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} >
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
                        onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} >
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
                        onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} >
                        <Text style={styles.keypadButtonText}>{num}</Text>
                      </Pressable>
                    ))}
                    {/* Row 4: ., 0, backspace */}
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                      onPress={() => handleKeypadPress('.')}
                      onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} >
                      <Text style={styles.keypadButtonText}>.</Text>
                    </Pressable>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                      onPress={() => handleKeypadPress('0')}
                      onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} >
                      <Text style={styles.keypadButtonText}>0</Text>
                    </Pressable>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={[styles.keypadButton, { width: keypadSizing.buttonWidth }]}
                      onPress={() => handleKeypadPress('backspace')}
                      onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} disabled={!sendAmount || sendAmount === '0'}
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
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
        
        {/* Send/Authorize Button */}
        <View
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
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
              const enteredAmountValue = Number.parseFloat(sendAmount.replace(/,/g, ''))
              const receiveAmountValue =
                amountEntryMode === 'receive'
                  ? enteredAmountValue
                  : sendCurrency !== receiveCurrency
                    ? (reverseExchangeRate > 0 ? enteredAmountValue / reverseExchangeRate : enteredAmountValue * exchangeRate)
                    : enteredAmountValue
              if (!sendAmount || sendAmount === '0' || receiveAmountValue <= 0 || !recipient || !selectedPaymentMethod) return
              
              // For otherCurrency, require both currency and payment method selection
              if (selectedPaymentMethod === 'otherCurrency' && (!selectedOtherCurrency || !selectedOtherPaymentMethod)) return

              if (verificationBlocksSend) return

              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

              // Calculate order amounts using FX Engine (sync — instant navigation for balance sends)
              let calculatedSendingAmount = 0
              let calculatedFeeAmount = 0
              let calculatedTotalAmount = 0

              if (sendCurrency !== receiveCurrency) {
                // Validate exchangeRates before using
                if (!exchangeRates || !Array.isArray(exchangeRates) || exchangeRates.length === 0) {
                  showError('Exchange rates not available. Please try again later.')
                  return
                }

                try {
                  const orderAmounts = mobileFxEngine.calculateOrderAmounts(
                    receiveAmountValue,
                    sendCurrency,
                    receiveCurrency,
                    exchangeRates,
                  )
                  calculatedSendingAmount = orderAmounts.sendAmount
                  calculatedFeeAmount = orderAmounts.feeAmount
                  calculatedTotalAmount = orderAmounts.totalAmount
                } catch (error) {
                  console.error('Error calculating order amounts:', error)
                  showError('Failed to calculate exchange rate. Please try again.')
                  return
                }
              } else {
                // Same currency - no conversion needed
                calculatedSendingAmount = receiveAmountValue
                calculatedTotalAmount = receiveAmountValue
              }

              // Balance: navigate immediately — Noah pricing quote runs on review screen (was blocking here ~300ms–2s).
              if (selectedPaymentMethod === 'balance') {
                const transactionId = generateTransactionId()
                navigation.navigate('SendConfirm' as never, {
                  recipient,
                  calculatedSendingAmount,
                  calculatedFeeAmount,
                  calculatedTotalAmount,
                  receiveAmountValue,
                  selectedBalanceCurrency,
                  receiveCurrency: recipient.currency,
                  transactionId,
                } as never)
                return
              }

              let pricingQuoteId: string | undefined
              let pricingQuoteExpiry: string | undefined
              let pricingQuoteResult: PricingQuote | null = null
              try {
                const payoutMethodForQuote =
                  selectedPaymentMethod === 'otherCurrency'
                    ? normalizePayoutMethodForPricing(selectedOtherPaymentMethod)
                    : undefined
                const quote = await noahService.createPricingQuote({
                  sourceCurrency: sendCurrency,
                  destinationCurrency: recipient.currency,
                  sourceAmount: calculatedSendingAmount,
                  rail:
                    selectedPaymentMethod === 'otherCurrency'
                      ? selectedOtherPaymentMethod || undefined
                      : selectedPaymentMethod,
                  countryCode: recipient.country_code,
                  payoutCountry: recipient.country_code || inferCountryFromRecipientCurrency(recipient.currency),
                  payoutMethod: payoutMethodForQuote,
                })
                pricingQuoteResult = quote
                pricingQuoteId = quote.quoteId
                pricingQuoteExpiry = quote.expiresAt
                const feeFromQuote = quote.pricingTotals?.total_user_fee ?? quote.totalFeeAmount
                calculatedFeeAmount = feeFromQuote
                calculatedTotalAmount = calculatedSendingAmount + feeFromQuote
              } catch (quoteError) {
                console.warn('Pricing quote unavailable, falling back to local calculation:', quoteError)
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
                // Generate Transaction ID (same format as web app)
                const transactionId = generateTransactionId()
                // Navigate based on payment method type
                if (selectedOtherPaymentMethod === 'sbp') {
                  // SBP works like Plaid - navigate to OpenBanking screen
                  navigation.navigate('OpenBanking' as never, {
                    transactionId: transactionId,
                    sendAmount: calculatedSendingAmount,
                    receiveAmount: receiveAmountValue,
                    sendCurrency: sendCurrency,
                    receiveCurrency: recipient.currency,
                    recipient: recipient,
                    paymentMethod: selectedOtherPaymentMethod,
                    feeAmount: calculatedFeeAmount,
                    totalAmount: calculatedTotalAmount,
                  } as never)
                } else if (selectedOtherPaymentMethod === 'bankTransfer') {
                  navigation.navigate('VirtualBankAccount' as never, {
                    transactionId: transactionId,
                    sendAmount: calculatedSendingAmount,
                    receiveAmount: receiveAmountValue,
                    sendCurrency: sendCurrency,
                    receiveCurrency: recipient.currency,
                    recipient: recipient,
                    paymentMethod: selectedOtherPaymentMethod,
                    feeAmount: calculatedFeeAmount,
                    totalAmount: calculatedTotalAmount,
                  } as never)
                } else if (
                  selectedOtherCurrency === 'STABLE' &&
                  ['USDC', 'USDT'].includes(String(selectedOtherPaymentMethod || '').toUpperCase())
                ) {
                  navigation.navigate('Stablecoin' as never, {
                    transactionId,
                    sendAmount: calculatedSendingAmount,
                    receiveAmount: receiveAmountValue,
                    sendCurrency,
                    receiveCurrency: recipient.currency,
                    recipient,
                    feeAmount: calculatedFeeAmount,
                    totalAmount: calculatedTotalAmount,
                    paymentMethod: String(selectedOtherPaymentMethod).toLowerCase(),
                  } as never)
                } else {
                  // For mobile money methods (M-Pesa, MTN MOMO)
                  // Navigate to MobileMoney screen for network selection and phone number
                  navigation.navigate('MobileMoney' as never, {
                    transactionId: transactionId,
                    sendAmount: calculatedSendingAmount,
                    receiveAmount: receiveAmountValue,
                    sendCurrency: sendCurrency,
                    receiveCurrency: recipient.currency,
                    recipient: recipient,
                    paymentMethod: selectedOtherPaymentMethod,
                    feeAmount: calculatedFeeAmount,
                    totalAmount: calculatedTotalAmount,
                  } as never)
                }
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
                          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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

                {/* Through Another Currency Section */}
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
                          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          setSelectedOtherCurrency(currency.code)
                          setSelectedPaymentMethod('otherCurrency')
                          setSelectedOtherPaymentMethod(null)
                        }}
                      >
                        <View style={styles.flagContainerSmall}>
                          {currency.code === 'STABLE' ? (
                            <Coins size={18} color={colors.text.primary} strokeWidth={2} />
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
                          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
                              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                              setSelectedOtherPaymentMethod(method.code)
                              setShowCurrencyPicker(false)
                            }}
                          >
                            <View style={styles.flagContainerSmall}>
                              {selectedOtherCurrency === 'STABLE' ? (
                                getTokenIconUrl(method.code) ? (
                                  <Image
                                    source={{ uri: getTokenIconUrl(method.code)! }}
                                    style={styles.flagImageSmall}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <Coins size={16} color={colors.text.primary} strokeWidth={2} />
                                )
                              ) : method.icon && paymentMethodIcons[method.icon] ? (
                                <Image 
                                  source={paymentMethodIcons[method.icon]}
                                  style={styles.flagImageSmall}
                                  resizeMode="cover"
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
              </View>
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
  scrollView: {
    flex: 1,
    paddingBottom: 0,
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
  /** Method + note + keypad: no `marginTop: 'auto'` (that pushed the block into the bottom bar). Flow sits under the rate row with a small gap. */
  sendMethodNoteKeypadGroup: {
    marginTop: 0,
    marginBottom: spacing[5],
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
  recipientAvatarCircleWrap: {
    position: 'relative',
  },
  recipientAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  easenetMarkBadgeSmall: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    zIndex: 3,
    elevation: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background.primary,
    overflow: 'hidden',
  },
  easenetMarkImgSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  /** Full-bleed inside circular clip (flag, token, or easetag photo) */
  recipientAvatarFill: {
    width: 36,
    height: 36,
    borderRadius: 0,
  },
  recipientAvatarInitials: {
    ...textStyles.titleSmall,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
  },
  recipientInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 0,
  },
  recipientName: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    lineHeight: 18,
    marginBottom: 0,
  },
  recipientDetails: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    lineHeight: 16,
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
  /** Single-line amount (short $ € £): same rendering path as dashboard balance Text. */
  amountUnified: {
    flexShrink: 1,
    textAlign: 'center',
    maxWidth: '100%',
  },
  currencyPrefix: {
    fontSize: 50,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: fontFamily.black,
    marginRight: 2,
    includeFontPadding: false,
    paddingVertical: 0,
    ...Platform.select({
      android: { textAlignVertical: 'center' as const },
      default: {},
    }),
  },
  amountAssetIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountAssetIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  amountInput: {
    // Base fontSize - will be overridden by inline style for dynamic sizing
    fontSize: 50,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: fontFamily.black,
    textAlign: 'left',
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    marginVertical: 0,
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 48,
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
  },
})

function EasenetSendRecipientAvatar({
  recipient,
  getInitials,
  easenetPreview,
}: {
  recipient: Recipient
  getInitials: (name: string) => string
  easenetPreview?: HydratedEasenetProfile | null
}) {
  const displayName = (easenetPreview?.fullName || recipient.full_name).trim()
  const uri = String(easenetPreview?.avatarUrl || recipient.payee_avatar_url || '').trim()
  const avatarSource = avatarImageSource(uri)
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => {
    setImgFailed(false)
  }, [uri])
  return (
    <View style={styles.recipientAvatarCircle}>
      {avatarSource && !imgFailed ? (
        <Image
          source={avatarSource}
          style={styles.recipientAvatarFill}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <Text style={styles.recipientAvatarInitials}>{getInitials(displayName)}</Text>
      )}
    </View>
  )
}

function PayoutSendRecipientAvatar({
  recipient,
}: {
  recipient: Recipient
}) {
  const isWalletRecipient = String(recipient.bank_name || '').toLowerCase().includes('wallet')
  const tokenIcon = getTokenIconUrl(recipient.currency)
  const countryCode =
    recipient.country_code ||
    (recipient.currency === 'EUR' ? 'EU' : getCountryCodeForCurrency(recipient.currency) || 'US')
  const uri = String(recipient.payee_avatar_url || '').trim()
  const avatarSource = avatarImageSource(uri)
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => {
    setImgFailed(false)
  }, [uri])

  const hasPhoto = Boolean(avatarSource && !imgFailed)

  /** No photo: full-bleed flag or token in the circle (same visual weight as Easenet’s full-bleed photo). */
  if (!hasPhoto) {
    return (
      <View style={styles.recipientAvatarCircle}>
        {isWalletRecipient && tokenIcon ? (
          <Image source={{ uri: tokenIcon }} style={styles.recipientAvatarFill} resizeMode="cover" />
        ) : (
          <CountryFlag code={countryCode} size={36} style={styles.recipientAvatarFill} />
        )}
      </View>
    )
  }

  /** Photo: match Easenet — large image in circle + small corner badge (network / country). */
  return (
    <View style={styles.recipientAvatarCircleWrap}>
      <View style={styles.recipientAvatarCircle}>
        <Image
          source={avatarSource!}
          style={styles.recipientAvatarFill}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      </View>
      <View style={styles.easenetMarkBadgeSmall}>
        {isWalletRecipient && tokenIcon ? (
          <Image source={{ uri: tokenIcon }} style={styles.easenetMarkImgSmall} resizeMode="cover" />
        ) : (
          <CountryFlag code={countryCode} size={14} />
        )}
      </View>
    </View>
  )
}

function SendRecipientAvatar({
  recipient,
  getInitials,
  easenetPreview,
}: {
  recipient: Recipient
  getInitials: (name: string) => string
  easenetPreview?: HydratedEasenetProfile | null
}) {
  const isEasenet = isEasenetRecipientRecord(recipient)

  if (isEasenet) {
    return <EasenetSendRecipientAvatar recipient={recipient} getInitials={getInitials} easenetPreview={easenetPreview} />
  }

  return <PayoutSendRecipientAvatar recipient={recipient} />
}
