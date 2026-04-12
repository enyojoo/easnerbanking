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
  Dimensions,
  Modal,
  Image,
  Keyboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MessageSquareText, ChevronDown, User, Coins, RotateCcw } from 'lucide-react-native'
import Svg, { Path } from 'react-native-svg'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, shadows, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { supabase } from '../../lib/supabase'
import { Alert } from 'react-native'
import { useUserData } from '../../contexts/UserDataContext'
import { recipientService } from '../../lib/recipientService'
import { isDraftEasenetRecipient } from '../../lib/draftEasenetRecipient'
import { useAuth } from '../../contexts/AuthContext'
import { recordRecipientSentTouch } from '../../lib/recentSendRecipients'
import { isTier1Complete, TIER2_COMPLETE_PLACEHOLDER } from '../../lib/compliance'
import { mobileFxEngine } from '../../lib/fxEngine'
import { generateTransactionId } from '../../lib/transactionId'
import { useBalance } from '../../contexts/BalanceContext'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { CountryFlag } from '../../components/flags/CountryFlag'
import { getCountryCodeForCurrency } from '@easner/shared'
import { getApiBaseUrl } from '../../lib/apiClient'
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
import { EASNER_MARK_URL } from '../../lib/easnerBrand'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const KEYPAD_BUTTON_WIDTH = 113
const KEYPAD_GAP = 8 // spacing[2]
const KEYPAD_ROW_WIDTH = (KEYPAD_BUTTON_WIDTH * 3) + (KEYPAD_GAP * 2) // 113 * 3 + 8 * 2 = 355

function inferCountryFromRecipientCurrency(currency: string): string | undefined {
  const m: Record<string, string> = {
    KES: 'KE',
    GHS: 'GH',
    NGN: 'NG',
    ZAR: 'ZA',
  }
  return m[currency.toUpperCase()]
}

function mobileMoneyPrepareHints(r: Pick<Recipient, 'mobile_provider'>): string[] | undefined {
  const p = (r.mobile_provider || '').toLowerCase()
  if (p.includes('mtn')) return ['mtn', 'momo']
  if (p.includes('mpesa') || p.includes('m-pesa')) return ['mpesa']
  return undefined
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
function LandmarkIcon({ size = 24, color = '#000' }: { size?: number; color?: string }) {
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

function repricingReasonLabel(reasonCode: string): string {
  const map: Record<string, string> = {
    fx_moved: 'FX market moved',
    provider_fee_changed: 'Provider fee changed',
    route_unavailable: 'Selected route became unavailable',
    compliance_status_changed: 'Compliance status changed',
    subscription_changed: 'Subscription changed',
    quote_expired: 'Quote expired',
  }
  return map[reasonCode] || reasonCode.replaceAll('_', ' ')
}

export default function SendAmountScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { user, userProfile, refreshUserProfile } = useAuth()
  const noahKycStatus =
    userProfile?.noah_kyc_status ??
    (userProfile as { noah_kyc_status?: string; profile?: { noah_kyc_status?: string } })?.profile?.noah_kyc_status
  const {
    exchangeRates: exchangeRatesFromContext,
    invalidateRecipients,
    refreshRecipients,
  } = useUserData()
  const { balances, updateBalanceOptimistically } = useBalance()
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
    { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
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
    RUB: [
      { code: 'bankTransfer', name: 'Bank Transfer' },
      { code: 'sbp', name: 'SBP', icon: 'sbp' },
    ],
  }

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  // Update recipient when screen comes into focus (smooth transition)
  useFocusEffect(
    React.useCallback(() => {
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
    }, [route.params, refreshUserProfile, noahKycStatus])
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
  React.useEffect(() => {
    Animated.stagger(100, [
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start()
  }, [headerAnim, contentAnim])

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

  const currentBalance = parseFloat(balances[selectedBalanceCurrency as 'USD' | 'EUR'] || '0')
  const enteredAmount = sendAmount ? Number.parseFloat(sendAmount.replace(/,/g, '')) || 0 : 0
  const receiveCurrency = recipient?.currency || 'EUR'
  const sendCurrency = selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency
    ? selectedOtherCurrency === 'STABLE'
      ? (selectedOtherPaymentMethod?.toUpperCase() || selectedBalanceCurrency)
      : selectedOtherCurrency
    : selectedBalanceCurrency
  const dynamicAmountFontSize = getDynamicFontSize(sendAmount)
  const dynamicAmountLineHeight = Math.round(dynamicAmountFontSize * 1.05)
  const amountTextStyle = {
    ...textStyles.balanceDisplay,
    fontSize: dynamicAmountFontSize,
    ...(Platform.OS === 'android'
      ? { lineHeight: dynamicAmountLineHeight, includeFontPadding: false as const }
      : { lineHeight: dynamicAmountLineHeight }),
  }
  const amountDisplayCurrency = amountEntryMode === 'receive' ? receiveCurrency : sendCurrency
  const amountDisplaySymbolRaw = getCurrencySymbol(amountDisplayCurrency)
  const amountDisplaySymbol =
    (typeof amountDisplaySymbolRaw === 'string' && amountDisplaySymbolRaw.trim().length > 0
      ? amountDisplaySymbolRaw
      : String(amountDisplayCurrency || '').trim()) || getCurrencySymbol(selectedBalanceCurrency)
  const amountAssetIconUrl = getTokenIconUrl(String(amountDisplayCurrency || '').toUpperCase()) || null
  const showAmountAssetIcon = Boolean(amountAssetIconUrl && amountDisplaySymbol.length > 2)
  const amountPrefixStyle = {
    ...amountTextStyle,
    fontSize:
      amountDisplaySymbol.length > 2
        ? Math.max(Math.round(dynamicAmountFontSize * 0.52), 20)
        : (amountTextStyle as { fontSize: number }).fontSize,
    lineHeight:
      amountDisplaySymbol.length > 2
        ? Math.max(Math.round(dynamicAmountLineHeight * 0.55), 22)
        : Platform.OS === 'android'
          ? dynamicAmountLineHeight
          : undefined,
  }

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
    !payoutCorridorActive ||
    !selectedPaymentMethod ||
    (selectedPaymentMethod === 'otherCurrency' && (!selectedOtherCurrency || !selectedOtherPaymentMethod)) ||
    verificationBlocksSend

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
                      outputRange: [-20, 0],
                    })
                  }]
                }
              ]}
            >
              <Pressable
               android_ripple={ripple.neutral}
                onPress={() => {
                  // Always go back to SelectRecentRecipientScreen, never to SelectRecipientScreen
                  navigation.navigate('SelectRecentRecipient' as never, {
                    preferredBalanceCurrency: selectedBalanceCurrency,
                  } as never)
                }}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
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
                      outputRange: [30, 0],
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
                    navigation.navigate('SelectRecentRecipient' as never, {
                      preferredBalanceCurrency: selectedBalanceCurrency,
                      selectedPaymentMethod,
                      selectedOtherCurrency,
                      selectedOtherPaymentMethod,
                    } as never)
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
                    navigation.navigate('SelectRecentRecipient' as never, {
                      preferredBalanceCurrency: selectedBalanceCurrency,
                    } as never)
                  }} >
                  <View style={styles.selectRecipientIcon}>
                    <User size={20} color={colors.text.secondary} strokeWidth={2} />
                  </View>
                  <Text style={styles.selectRecipientText}>Select Recipient</Text>
                </Pressable>
              )}

              {recipient && !payoutCorridorActive ? (
                <View
                  style={{
                    marginHorizontal: spacing[4],
                    marginBottom: spacing[3],
                    padding: spacing[3],
                    backgroundColor: '#fff7ed',
                    borderRadius: borderRadius.md,
                  }}
                >
                  <Text style={{ color: '#9a3412', fontSize: 14, lineHeight: 20 }}>
                    This recipient&apos;s payout corridor is temporarily unavailable. Choose another recipient or try again
                    later.
                  </Text>
                </View>
              ) : null}

              {/* Amount Display - Wrapped with exchange info */}
              <View style={styles.amountSection}>
                <View style={styles.amountInputWrapper}>
                  <View style={styles.amountInputContainer}>
                    {recipient && (
                      showAmountAssetIcon ? (
                        <View style={styles.amountAssetIconWrap}>
                          <Image
                            source={{ uri: amountAssetIconUrl! }}
                            style={styles.amountAssetIcon}
                            resizeMode="cover"
                          />
                        </View>
                      ) : (
                        <Text
                          style={[
                            styles.currencyPrefix,
                            amountPrefixStyle,
                          ]}
                          numberOfLines={1}
                        >
                          {amountDisplaySymbol}
                        </Text>
                      )
                    )}
              <TextInput
                      style={[
                        styles.amountInput, 
                        !recipient && styles.amountInputDisabled,
                        amountTextStyle,
                      ]}
                      value={recipient ? sendAmount : '0'}
                onChangeText={(text) => {
                        if (!recipient) return // Disabled until recipient is selected
                        
                        // Remove all commas and non-numeric except decimal
                        let cleaned = text.replace(/,/g, '').replace(/[^0-9.]/g, '')
                        
                        // Format the cleaned value
                        const formatted = formatAmount(cleaned)
                        setSendAmount(formatted)
                }}
                placeholder="0"
                      placeholderTextColor={colors.text.secondary}
                keyboardType="numeric"
                      editable={!!recipient}
                      autoFocus={false}
                      showSoftInputOnFocus={false}
                    />
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
                          <Ionicons name="swap-vertical" size={13} color={colors.primary.main} />
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
              <View style={styles.sendMethodNoteKeypadGroup}>
              {/* Sending Method - Currency Balance Selector (Centered) */}
              <View style={styles.balanceSection}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.balanceSelector}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setShowCurrencyPicker(true)
                  }} >
                  <View style={styles.flagContainer}>
                    {selectedPaymentMethod === 'balance' ? (
                      <CurrencyFlag currency={selectedBalanceCurrency} size={24} style={styles.flagImage} />
                    ) : selectedPaymentMethod === 'linkBank' ? (
                      <Ionicons name="link" size={20} color={colors.text.primary} />
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
                  <Text style={styles.balanceSelectorText} numberOfLines={1}>
                    {selectedPaymentMethod === 'balance' 
                      ? `${selectedBalanceCurrency} Balance`
                      : selectedPaymentMethod === 'linkBank'
                      ? 'Link Bank'
                      : selectedPaymentMethod === 'virtualBank'
                      ? 'Bank Transfer'
                      : selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency && selectedOtherPaymentMethod
                      ? currencyPaymentMethods[selectedOtherCurrency]?.find(m => m.code === selectedOtherPaymentMethod)?.name || 'Select Method'
                      : selectedPaymentMethod === 'otherCurrency' && selectedOtherCurrency
                      ? `${selectedOtherCurrency} - Select Method`
                      : 'Select Method'}
              </Text>
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
                  <View style={styles.keypadGrid}>
                    {/* Row 1: 1, 2, 3 */}
                    {[1, 2, 3].map((num) => (
                <Pressable
                       android_ripple={ripple.neutral}
                        key={num}
                        style={styles.keypadButton}
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
                        style={styles.keypadButton}
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
                        style={styles.keypadButton}
                        onPress={() => handleKeypadPress(num.toString())}
                        onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} >
                        <Text style={styles.keypadButtonText}>{num}</Text>
                      </Pressable>
                    ))}
                    {/* Row 4: ., 0, backspace */}
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={styles.keypadButton}
                      onPress={() => handleKeypadPress('.')}
                      onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} >
                      <Text style={styles.keypadButtonText}>.</Text>
                    </Pressable>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={styles.keypadButton}
                      onPress={() => handleKeypadPress('0')}
                      onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} >
                      <Text style={styles.keypadButtonText}>0</Text>
                    </Pressable>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={styles.keypadButton}
                      onPress={() => handleKeypadPress('backspace')}
                      onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)} disabled={!sendAmount || sendAmount === '0'}
                    >
                      <Ionicons 
                        name="backspace" 
                        size={24} 
                        color={(!sendAmount || sendAmount === '0') ? colors.text.secondary : colors.text.primary} 
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
            { paddingTop: spacing[2], paddingBottom: Math.max(insets.bottom, spacing[4]) },
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
            style={[styles.sendButton, sendButtonDisabled && styles.sendButtonDisabled]}
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
              
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              
              // Calculate order amounts using FX Engine
              let calculatedSendingAmount = 0
              let calculatedFeeAmount = 0
              let calculatedTotalAmount = 0
              
              if (sendCurrency !== receiveCurrency) {
                // Validate exchangeRates before using
                if (!exchangeRates || !Array.isArray(exchangeRates) || exchangeRates.length === 0) {
                  Alert.alert('Error', 'Exchange rates not available. Please try again later.')
                  return
                }
                
                try {
                  const orderAmounts = mobileFxEngine.calculateOrderAmounts(
                    receiveAmountValue,
                    sendCurrency,
                    receiveCurrency,
                    exchangeRates
                  )
                  calculatedSendingAmount = orderAmounts.sendAmount
                  calculatedFeeAmount = orderAmounts.feeAmount
                  calculatedTotalAmount = orderAmounts.totalAmount
                } catch (error) {
                  console.error('Error calculating order amounts:', error)
                  Alert.alert('Error', 'Failed to calculate exchange rate. Please try again.')
                  return
                }
              } else {
                // Same currency - no conversion needed
                calculatedSendingAmount = receiveAmountValue
                calculatedTotalAmount = receiveAmountValue
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
                    selectedPaymentMethod === 'balance'
                      ? 'wallet'
                      : selectedPaymentMethod === 'otherCurrency'
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
              
              if (selectedPaymentMethod === 'balance') {
                // Use Bridge transfer API to send from wallet to external bank account
                try {
                  // Get user's Bridge wallet
                  const walletsResponse = await fetch(`${getApiBaseUrl() || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'}/api/noah/wallets`, {
                    headers: {
                      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                    },
                  })
                  
                  if (!walletsResponse.ok) {
                    Alert.alert('Error', 'Failed to fetch wallet. Please try again.')
                    return
                  }
                  
                  const walletsData = await walletsResponse.json()
                  const wallet = walletsData.wallets?.[0] // Get first wallet (Solana)
                  
                  if (!wallet) {
                    Alert.alert('Error', 'No wallet found. Please set up your account first.')
                    return
                  }

                  const sourceWalletId = String(wallet.sourceWalletId || wallet.walletId || '')
                  if (!sourceWalletId) {
                    Alert.alert('Error', 'No source wallet id from Noah.')
                    return
                  }

                  const usdLike =
                    String(recipient.currency || '').toUpperCase() === 'USD' &&
                    String(recipient.country_code || '').toUpperCase() === 'US'
                  const hasAch =
                    Boolean(recipient.routing_number?.trim()) && Boolean(recipient.account_number?.trim())
                  const easetag = resolveRecipientEasetagForUi(recipient)
                  const eurSepa =
                    String(recipient.currency || '').toUpperCase() === 'EUR' &&
                    Boolean(recipient.iban?.trim())
                  const eurCountry = (recipient.country_code || 'DE').toUpperCase()
                  const canUseFiatBalance =
                    selectedBalanceCurrency === 'USD' || selectedBalanceCurrency === 'EUR'
                  const mobileCorridorCountry = (
                    recipient.country_code ||
                    inferCountryFromRecipientCurrency(recipient.currency) ||
                    ''
                  ).toUpperCase()
                  const isMobile =
                    isMobileMoneyRecipient(recipient) &&
                    Boolean(mobileCorridorCountry) &&
                    canUseFiatBalance

                  let transfer

                  if (easetag) {
                    transfer = await noahService.createWalletToWalletTransfer({
                      destinationEasetag: easetag,
                      amount: calculatedTotalAmount.toFixed(8),
                      currency: selectedBalanceCurrency.toLowerCase(),
                    })
                  } else if (recipient.noah_external_account_id?.trim()) {
                    transfer = await noahService.createTransfer({
                      amount: calculatedTotalAmount.toString(),
                      currency: selectedBalanceCurrency.toLowerCase(),
                      sourceWalletId,
                      destinationExternalAccountId: recipient.noah_external_account_id.trim(),
                    })
                  } else if (isMobile) {
                    const phone = (recipient.phone_number || recipient.account_number || '').replace(/\s/g, '')
                    if (!phone) {
                      Alert.alert(
                        'Recipient not ready',
                        'Mobile money needs a phone number on the recipient.',
                      )
                      return
                    }
                    const fiatAmount = receiveAmountValue.toFixed(2)
                    const prep = await noahService.prepareMobileMoneyPayout({
                      fiatAmount,
                      countryCode: mobileCorridorCountry,
                      currency: recipient.currency.toUpperCase(),
                      fullName: recipient.full_name,
                      phoneNumber: phone,
                      paymentMethodSubstrings: mobileMoneyPrepareHints(recipient),
                    })
                    if (!prep.ok || !prep.formSessionId || !prep.cryptoAuthorizedAmount) {
                      throw new Error(
                        prep.error ||
                          'Noah could not prepare this mobile payout. Confirm Identifier channels exist in sandbox.',
                      )
                    }
                    transfer = await noahService.createTransfer({
                      amount: fiatAmount,
                      currency: recipient.currency.toLowerCase(),
                      sourceWalletId,
                      formSessionId: prep.formSessionId,
                      cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount,
                      cryptoCurrency: prep.cryptoCurrency,
                    })
                  } else if (eurSepa && canUseFiatBalance) {
                    const fiatAmount = receiveAmountValue.toFixed(2)
                    const prep = await noahService.prepareSellPayout({
                      fiatAmount,
                      fullName: recipient.full_name,
                      countryCode: eurCountry,
                      currency: 'EUR',
                      iban: recipient.iban!.trim(),
                      accountType:
                        recipient.checking_or_savings === 'savings' ? 'Savings' : 'Checking',
                    })
                    if (!prep.ok || !prep.formSessionId || !prep.cryptoAuthorizedAmount) {
                      throw new Error(prep.error || 'Noah could not prepare SEPA payout.')
                    }
                    transfer = await noahService.createTransfer({
                      amount: fiatAmount,
                      currency: 'eur',
                      sourceWalletId,
                      formSessionId: prep.formSessionId,
                      cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount,
                      cryptoCurrency: prep.cryptoCurrency,
                    })
                  } else if (usdLike && hasAch && canUseFiatBalance) {
                    if (
                      !recipient.address_line1?.trim() ||
                      !recipient.city?.trim() ||
                      !recipient.state?.trim() ||
                      !recipient.postal_code?.trim()
                    ) {
                      Alert.alert(
                        'Address required',
                        'US bank payouts need street, city, state, and postal code on the recipient.',
                      )
                      return
                    }
                    const fiatAmount = receiveAmountValue.toFixed(2)
                    const prep = await noahService.prepareSellPayout({
                      fiatAmount,
                      fullName: recipient.full_name,
                      countryCode: 'US',
                      currency: 'USD',
                      accountNumber: recipient.account_number.trim(),
                      routingNumber: recipient.routing_number!.trim(),
                      addressLine1: recipient.address_line1.trim(),
                      city: recipient.city.trim(),
                      state: recipient.state.trim(),
                      postalCode: recipient.postal_code.trim(),
                      accountType:
                        recipient.checking_or_savings === 'savings' ? 'Savings' : 'Checking',
                      transferType:
                        recipient.transfer_type === 'Wire' ? 'Wire' : 'ACH',
                    })
                    if (!prep.ok || !prep.formSessionId || !prep.cryptoAuthorizedAmount) {
                      throw new Error(prep.error || 'Noah could not prepare this payout. Check recipient details.')
                    }
                    transfer = await noahService.createTransfer({
                      amount: fiatAmount,
                      currency: 'usd',
                      sourceWalletId,
                      formSessionId: prep.formSessionId,
                      cryptoAuthorizedAmount: prep.cryptoAuthorizedAmount,
                      cryptoCurrency: prep.cryptoCurrency,
                    })
                  } else {
                    Alert.alert(
                      'Recipient not ready',
                      'Noah balance send needs: Easetag, saved payout id, mobile money with country, EUR IBAN, or US ACH with full address.',
                    )
                    return
                  }
                  if (pricingQuoteId) {
                    const validation = await noahService.validatePricingQuote(pricingQuoteId)
                    await noahService.applyPricingQuote(pricingQuoteId, transfer.transaction_id || transfer.id)
                    const pt = pricingQuoteResult?.pricingTotals
                    const summaryLines =
                      pt != null && pricingQuoteResult
                        ? [
                            `Recipient gets: ${formatCurrency(pt.total_recipient_amount, recipient.currency)}`,
                            `Rate: 1 ${sendCurrency} = ${Number(pricingQuoteResult.effectiveRate).toFixed(6)} ${recipient.currency}`,
                            // total_user_fee: Easner + provider in source currency (buildPricingTotals)
                            `Total fees: ${formatCurrency(pt.total_user_fee, sendCurrency)}`,
                          ].join('\n')
                        : ''
                    if (validation.reasonCode) {
                      Alert.alert(
                        'Quote repriced',
                        summaryLines
                          ? `Pricing was revalidated due to: ${repricingReasonLabel(validation.reasonCode)}\n\n${summaryLines}`
                          : `Pricing was revalidated due to: ${repricingReasonLabel(validation.reasonCode)}`
                      )
                    } else if (pricingQuoteExpiry) {
                      Alert.alert(
                        'Quote applied',
                        summaryLines
                          ? `Final fee and total are locked for this transfer.\nQuote expires: ${new Date(pricingQuoteExpiry).toLocaleTimeString()}\n\n${summaryLines}`
                          : `Final fee and total are locked for this transfer.\nQuote expires: ${new Date(pricingQuoteExpiry).toLocaleTimeString()}`
                      )
                    } else if (summaryLines) {
                      Alert.alert('Quote applied', summaryLines)
                    }
                  }
                  
                  // Optimistic balance update AFTER transfer created (like CashApp/Revolut - instant UI feedback)
                  // Pass transaction_id to prevent double update in real-time handler
                  if (selectedBalanceCurrency === 'USD' || selectedBalanceCurrency === 'EUR') {
                    updateBalanceOptimistically(
                      selectedBalanceCurrency as 'USD' | 'EUR', 
                      calculatedTotalAmount,
                      'subtract',
                      transfer.transaction_id || transfer.id
                    )
                  }
                  
                  // Haptic feedback for success
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

                  let recipientForDetails: Recipient = recipient
                  if (
                    user?.id &&
                    recipient?.id &&
                    easetag &&
                    isDraftEasenetRecipient(recipient.id) &&
                    userProfile?.id
                  ) {
                    try {
                      const tag = recipient.payee_easetag!.trim()
                      const created = await recipientService.create(userProfile.id, {
                        fullName: recipient.full_name,
                        accountNumber: tag,
                        bankName: `Easetag (@${tag})`,
                        currency: 'USD',
                        countryCode: 'US',
                        payeeEasetag: tag,
                        payeeAvatarUrl: recipient.payee_avatar_url ?? null,
                        payeeAccountKind: recipient.payee_account_kind,
                      })
                      await invalidateRecipients()
                      await refreshRecipients(true)
                      recipientForDetails = created
                      void recordRecipientSentTouch(user.id, created.id)
                    } catch (persistErr) {
                      console.warn('Post-send Easetag recipient save failed:', persistErr)
                    }
                  } else if (user?.id && recipient?.id) {
                    void recordRecipientSentTouch(user.id, recipient.id)
                  }

                navigation.navigate('SendTransactionDetails' as never, {
                    transactionId: transfer.transaction_id || transfer.id,
                  sendAmount: calculatedSendingAmount,
                  receiveAmount: receiveAmountValue,
                  sendCurrency: selectedBalanceCurrency,
                  receiveCurrency: recipientForDetails.currency,
                  recipient: recipientForDetails,
                  paymentMethod: 'balance',
                    noahTransferId: transfer.id,
                  feeAmount: calculatedFeeAmount,
                  totalAmount: calculatedTotalAmount,
                } as never)
                } catch (error: any) {
                  console.error('Error creating transfer:', error)
                  // Revert optimistic balance update on error
                  if (selectedBalanceCurrency === 'USD' || selectedBalanceCurrency === 'EUR') {
                    // Balance will be refreshed automatically, but we could add revert logic here if needed
                  }
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
                  Alert.alert('Error', error.message || 'Failed to create transfer. Please try again.')
                }
              } else if (selectedPaymentMethod === 'linkBank') {
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
                  ? 'Send' 
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
              height: Math.min(SCREEN_HEIGHT * 0.78, 680),
              minHeight: Math.min(SCREEN_HEIGHT * 0.58, 520),
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
                  <Ionicons name="close" size={24} color={colors.text.secondary} />
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
                      sendingAmount > 0 &&
                      item.code === selectedBalanceCurrency
                    const displayBalance = showLiveRemaining ? balance - sendingAmount : balance
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
                        <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
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
                        <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: '#F9F9F9',
    borderRadius: 24,
    height: 52,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginBottom: 25,
    gap: spacing[3],
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  selectRecipientIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  selectRecipientText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Medium',
  },
  // Recipient Bar (when recipient is selected)
  recipientBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: 24,
    height: 56,
    width: '85%',
    alignSelf: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: 0,
    marginBottom: 25,
    gap: spacing[3],
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  recipientLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-Medium',
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
    borderColor: '#E2E2E2',
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
    fontFamily: 'Outfit-SemiBold',
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
    fontFamily: 'Outfit-SemiBold',
    lineHeight: 18,
    marginBottom: 0,
  },
  recipientDetails: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
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
    // Fixed height to accommodate largest font size (65px) + some padding
    // This prevents layout shift when font size changes
    height: 80,
    minHeight: 80,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    // Ensure content is vertically centered within the fixed height
    height: '100%',
  },
  currencyPrefix: {
    fontSize: 50,
    fontWeight: '900',
    color: '#000000',
    fontFamily: 'Outfit-Black',
    marginRight: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    // Dynamic font size will be applied inline
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
    color: '#000000',
    fontFamily: 'Outfit-Black',
    textAlign: 'left',
    paddingLeft: 0,
    flexShrink: 1,
    // Allow text to scale down
    includeFontPadding: false,
    textAlignVertical: 'center',
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
    fontFamily: 'Outfit-Medium',
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
    backgroundColor: '#F9F9F9',
    borderRadius: 100,
    paddingHorizontal: spacing[3],
    paddingVertical: 0,
    marginBottom: spacing[2],
    gap: spacing[2],
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
    minWidth: 180,
    height: 48,
    justifyContent: 'center',
  },
  flagContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  flagImage: {
    width: 24,
    height: 24,
  },
  balanceSelectorText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: 'Outfit-Medium',
  },
  balanceText: {
    ...textStyles.bodyMedium,
    color: colors.primary.main,
    fontFamily: 'Outfit-Medium',
  },
  noteKeypadWrapper: {
    width: '100%',
    marginBottom: 0,
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: borderRadius.xl,
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
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
    marginBottom: 20,
  },
  noteInput: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-Regular',
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
    width: KEYPAD_ROW_WIDTH,
    gap: KEYPAD_GAP,
    rowGap: KEYPAD_GAP,
  },
  keypadButton: {
    width: KEYPAD_BUTTON_WIDTH,
    height: 50,
    borderRadius: 20,
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  keypadButtonText: {
    fontSize: 28,
    lineHeight: 34,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
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
    paddingVertical: spacing[1],
    marginBottom: spacing[2],
    alignSelf: 'center',
    maxWidth: '100%',
  },
  verifyInlineText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  verifyInlineLink: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontFamily: 'Outfit-SemiBold',
    textDecorationLine: 'underline',
  },
  sendButton: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
  },
  sendButtonText: {
    ...textStyles.titleLarge,
    color: colors.text.inverse,
    fontFamily: 'Outfit-SemiBold',
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
        shadowColor: '#000',
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
    fontFamily: 'Outfit-SemiBold',
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
    fontFamily: 'Outfit-SemiBold',
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
    fontFamily: 'Outfit-SemiBold',
    marginBottom: 2,
  },
  currencyItemBalance: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
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
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
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
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => {
    setImgFailed(false)
  }, [uri])
  return (
    <View style={styles.recipientAvatarCircleWrap}>
      <View style={styles.recipientAvatarCircle}>
        {uri && !imgFailed ? (
          <Image
            source={{ uri }}
            style={styles.recipientAvatarFill}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <Text style={styles.recipientAvatarInitials}>{getInitials(displayName)}</Text>
        )}
      </View>
      <View style={styles.easenetMarkBadgeSmall}>
        <Image source={{ uri: EASNER_MARK_URL }} style={styles.easenetMarkImgSmall} resizeMode="cover" />
      </View>
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
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => {
    setImgFailed(false)
  }, [uri])

  const hasPhoto = Boolean(uri && !imgFailed)

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
          source={{ uri }}
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
