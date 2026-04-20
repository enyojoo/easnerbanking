import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Animated,
  Image,
  ScrollView,
  TextInput,
  Modal,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Keyboard,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScrollView as GestureHandlerScrollView } from 'react-native-gesture-handler'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Wallet, Building2, Smartphone, AtSign, Search } from 'lucide-react-native'
import {
  fetchEasenetPublicProfileCached,
  primeEasenetPublicProfileCache,
  warmEasenetPublicProfiles,
} from '../../lib/easenetProfile'
import { EasenetLookupPreview } from '../../components/EasenetLookupPreview'
import { EasenetRecipientHydratedPreview } from '../../components/EasenetRecipientHydratedPreview'
import { RecipientPayoutPreview } from '../../components/RecipientPayoutPreview'
import { isEasenetRecipientRecord, resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'
import {
  mergeLastSentMaps,
  sortRecipientsForSendHub,
  filterRecipientsBySearch,
} from '../../lib/recentSendRecipients'
import { buildDraftEasenetRecipient, isDraftEasenetRecipient } from '../../lib/draftEasenetRecipient'
import { NavigationProps, Recipient } from '../../types'
import { colors, shadows, textStyles, borderRadius, spacing, motion } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import ScreenWrapper from '../../components/ScreenWrapper'
import KeyboardSafeContainer from '../../components/KeyboardSafeContainer'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrenciesCatalog, useRecipientsList, useTransactionsList, mapLedgerRowToTransaction } from '../../hooks/queries'
import { useScope } from '../../query/scope'
import { invalidateRecipientsFeed } from '../../query/refresh-user-feeds'
import { recipientService } from '../../lib/recipientService'
import { getAccountTypeConfigFromCurrency } from '../../lib/currencyAccountTypes'
import { formatIBAN, formatSortCode, formatRoutingNumber, formatAccountNumber } from '../../utils/formatters'
import { CountryCurrency } from '../../lib/countryCurrencyMapping'
import {
  getCatalogByRecipientTypeWithJurisdiction,
  getRecipientProviders,
  getWalletAssets,
  getWalletNetworksForAsset,
  type RecipientType,
} from '../../lib/recipientCatalog'
import { getAllowedCountriesCached } from '../../lib/jurisdictionCountryPolicy'
import { getNetworkIconUrl, getTokenIconUrl } from '../../lib/cryptoIcons'
import { ShimmerLoader } from '../../components/premium'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { CountryFlag } from '../../components/flags/CountryFlag'
import { getCountryCodeForCurrency } from '@easner/shared'

// Helper function to get initials from name
const getInitials = (name: string): string => {
  const parts = name.trim().split(' ')
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Dropdown panels live inside the add-recipient modal `ScrollView`. On Android, nested
 * `FlatList` inside a parent `ScrollView` often steals gestures and does not scroll the list.
 * Use a bounded `ScrollView` for options instead (with parent form scroll paused while open).
 */
function RecipientFormDropdownList({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerScrollView
      style={styles.currencyDropdownList}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      {children}
    </GestureHandlerScrollView>
  )
}

export default function SelectRecentRecipientScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { user, userProfile } = useAuth()
  const preferredBalanceCurrency = String((route.params as any)?.preferredBalanceCurrency || '').toUpperCase()
  const routePaymentMethod = (route.params as any)?.selectedPaymentMethod as
    | 'balance'
    | 'linkBank'
    | 'virtualBank'
    | 'otherCurrency'
    | undefined
  const routeOtherCurrency = (route.params as any)?.selectedOtherCurrency as string | undefined
  const routeOtherPaymentMethod = (route.params as any)?.selectedOtherPaymentMethod as string | undefined
  const qc = useQueryClient()
  const { scope } = useScope()
  const recipientsQuery = useRecipientsList()
  const { data: currencies = [] } = useCurrenciesCatalog()
  const txHubQuery = useTransactionsList({}, 100)
  const recipients = recipientsQuery.data ?? []
  const recipientsLoading = recipientsQuery.isPending
  const transactions = useMemo(() => {
    if (!user?.id) return []
    const rows = txHubQuery.data?.pages?.[0]?.transactions ?? []
    return (rows as Record<string, unknown>[]).map((r) => mapLedgerRowToTransaction(user.id, r))
  }, [txHubQuery.data, user?.id])
  const [searchTerm, setSearchTerm] = useState('')
  const [lastSentAtByRecipient, setLastSentAtByRecipient] = useState<Record<string, number>>({})
  
  // Add recipient flow states
  const [showRecipientTypeModal, setShowRecipientTypeModal] = useState(false)
  const [showBankAccountForm, setShowBankAccountForm] = useState(false)
  const [selectedRecipientType, setSelectedRecipientType] = useState<'wallet' | 'bank' | 'mobile' | 'easenet' | null>(null)
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false)
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [showWalletAssetDropdown, setShowWalletAssetDropdown] = useState(false)
  const [showWalletNetworkDropdown, setShowWalletNetworkDropdown] = useState(false)
  const [currencySearchTerm, setCurrencySearchTerm] = useState('')
  const [providerSearchTerm, setProviderSearchTerm] = useState('')
  const [walletAssetSearchTerm, setWalletAssetSearchTerm] = useState('')
  const [walletNetworkSearchTerm, setWalletNetworkSearchTerm] = useState('')
  const [showScanModal, setShowScanModal] = useState(false)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selectedCountryCurrency, setSelectedCountryCurrency] = useState<CountryCurrency | null>(null)
  const [transferType, setTransferType] = useState<'ACH' | 'Wire' | null>(null)
  const [easenetProfile, setEasenetProfile] = useState<{
    easetag: string
    fullName: string
    avatarUrl: string | null
    accountKind: 'business' | 'personal'
  } | null>(null)
  const [easenetLookupLoading, setEasenetLookupLoading] = useState(false)
  const [easenetLookupError, setEasenetLookupError] = useState<string | null>(null)
  const [androidDropdownKeyboardHeight, setAndroidDropdownKeyboardHeight] = useState(0)

  /** Hub search (@mode) live lookup — separate from add-recipient modal. */
  const [hubSearchEasenet, setHubSearchEasenet] = useState<{
    easetag: string
    fullName: string
    avatarUrl: string | null
    accountKind: 'business' | 'personal'
  } | null>(null)
  const [hubSearchLoading, setHubSearchLoading] = useState(false)
  const [hubSearchError, setHubSearchError] = useState<string | null>(null)
  const [jurisdictionUnrestricted, setJurisdictionUnrestricted] = useState(true)
  const [jurisdictionCodes, setJurisdictionCodes] = useState<string[] | null>(null)

  const jurisdictionPolicy = useMemo(
    () => ({ unrestricted: jurisdictionUnrestricted, codes: jurisdictionCodes }),
    [jurisdictionUnrestricted, jurisdictionCodes],
  )

  useEffect(() => {
    void getAllowedCountriesCached('kyb').then((p) => {
      setJurisdictionUnrestricted(p.unrestricted)
      setJurisdictionCodes(p.codes)
    })
  }, [])

  const recipientCatalogFor = (type: RecipientType) =>
    getCatalogByRecipientTypeWithJurisdiction(type, jurisdictionPolicy)

  const [newRecipient, setNewRecipient] = useState({
    fullName: '',
    accountNumber: '',
    bankName: '',
    currency: 'USD',
    routingNumber: '',
    sortCode: '',
    iban: '',
    swiftBic: '',
    phoneNumber: '',
    provider: '',
    walletAddress: '',
    network: '',
    memoTag: '',
    checkingOrSavings: '',
    addressLine1: '',
    payeeEasetag: '',
  })

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  useEffect(() => {
    if (!user?.id) {
      setLastSentAtByRecipient({})
      return
    }
    let cancelled = false
    void mergeLastSentMaps(user.id, transactions).then((merged) => {
      if (!cancelled) setLastSentAtByRecipient(merged)
    })
    return () => {
      cancelled = true
    }
  }, [user?.id, transactions])

  const { sorted: hubSorted, recentIds } = useMemo(
    () => sortRecipientsForSendHub(recipients, lastSentAtByRecipient),
    [recipients, lastSentAtByRecipient],
  )

  const hubDisplayRecipients = useMemo(
    () => filterRecipientsBySearch(hubSorted, searchTerm),
    [hubSorted, searchTerm],
  )

  useEffect(() => {
    const easenetRows = recipients.filter((r) => isEasenetRecipientRecord(r))
    if (easenetRows.length === 0) return
    void Promise.allSettled(
      easenetRows.map((row) =>
        primeEasenetPublicProfileCache(resolveRecipientEasetagForUi(row), {
          fullName: row.full_name,
          avatarUrl: row.payee_avatar_url,
          accountKind: row.payee_account_kind,
        }),
      ),
    )
    void warmEasenetPublicProfiles(easenetRows.map((row) => resolveRecipientEasetagForUi(row)))
  }, [recipients])

  useEffect(() => {
    const t = searchTerm.trim()
    if (!t.startsWith('@')) {
      setHubSearchEasenet(null)
      setHubSearchLoading(false)
      setHubSearchError(null)
      return
    }
    const raw = t.replace(/^@+/, '').trim()
    if (raw.length < 4) {
      setHubSearchEasenet(null)
      setHubSearchLoading(false)
      setHubSearchError(null)
      return
    }
    let cancelled = false
    setHubSearchLoading(true)
    setHubSearchError(null)
    const timer = setTimeout(() => {
      void (async () => {
        const res = await fetchEasenetPublicProfileCached(raw)
        if (cancelled) return
        setHubSearchLoading(false)
        if (res.found) {
          setHubSearchEasenet({
            easetag: res.easetag,
            fullName: res.fullName,
            avatarUrl: res.avatarUrl,
            accountKind: res.accountKind,
          })
          setHubSearchError(null)
        } else {
          setHubSearchEasenet(null)
          setHubSearchError(
            res.reason === 'self' ? 'You cannot add yourself as a recipient.' : 'Easetag not found.',
          )
        }
      })()
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchTerm])

  const hubVirtualRecipient = useMemo(() => {
    if (!hubSearchEasenet || !userProfile?.id) return null
    return buildDraftEasenetRecipient({
      easetag: hubSearchEasenet.easetag,
      fullName: hubSearchEasenet.fullName,
      avatarUrl: hubSearchEasenet.avatarUrl,
      accountKind: hubSearchEasenet.accountKind,
      userId: userProfile.id,
    })
  }, [hubSearchEasenet, userProfile?.id])

  const sendHubFlatListData = useMemo(() => {
    if (!hubVirtualRecipient) return hubDisplayRecipients
    return [hubVirtualRecipient, ...hubDisplayRecipients]
  }, [hubVirtualRecipient, hubDisplayRecipients])

  useEffect(() => {
    if (selectedRecipientType !== 'easenet' || !showBankAccountForm) {
      return
    }
    const raw = newRecipient.payeeEasetag.trim().replace(/^@+/, '')
    if (raw.length < 4) {
      setEasenetProfile(null)
      setEasenetLookupError(null)
      setEasenetLookupLoading(false)
      return
    }
    let cancelled = false
    setEasenetLookupLoading(true)
    setEasenetLookupError(null)
    const t = setTimeout(() => {
      void (async () => {
        const res = await fetchEasenetPublicProfileCached(raw)
        if (cancelled) return
        setEasenetLookupLoading(false)
        if (res.found) {
          setEasenetProfile({
            easetag: res.easetag,
            fullName: res.fullName,
            avatarUrl: res.avatarUrl,
            accountKind: res.accountKind,
          })
          setEasenetLookupError(null)
        } else {
          setEasenetProfile(null)
          setEasenetLookupError(
            res.reason === 'self' ? 'You cannot add yourself as a recipient.' : 'Easetag not found.',
          )
        }
      })()
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [newRecipient.payeeEasetag, selectedRecipientType, showBankAccountForm])

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const onShow = Keyboard.addListener('keyboardDidShow', (event) => {
      setAndroidDropdownKeyboardHeight(event.endCoordinates?.height || 0)
    })
    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidDropdownKeyboardHeight(0)
    })
    return () => {
      onShow.remove()
      onHide.remove()
    }
  }, [])

  const handleSelectRecipient = async (recipient: Recipient) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    // Use navigate (not push) so re-entering amount after "Change recipient" does not stack duplicate
    // SendAmount screens — back should be hub once, then dashboard.
    navigation.navigate('SendAmount' as never, {
      recipient,
      fromSelectRecentRecipient: true,
      preferredBalanceCurrency: preferredBalanceCurrency === 'USD' || preferredBalanceCurrency === 'EUR'
        ? preferredBalanceCurrency
        : undefined,
      selectedPaymentMethod: routePaymentMethod,
      selectedOtherCurrency: routeOtherCurrency ?? null,
      selectedOtherPaymentMethod: routeOtherPaymentMethod ?? null,
    } as never)
  }

  const handleAddNewRecipient = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    resetForm()
    setShowRecipientTypeModal(true)
  }

  const resetForm = () => {
    setNewRecipient({
      fullName: '',
      accountNumber: '',
      bankName: '',
      currency: 'USD',
      routingNumber: '',
      sortCode: '',
      iban: '',
      swiftBic: '',
      phoneNumber: '',
      provider: '',
      walletAddress: '',
      network: '',
      memoTag: '',
      checkingOrSavings: '',
      addressLine1: '',
      payeeEasetag: '',
    })
    setEasenetProfile(null)
    setEasenetLookupError(null)
    setEasenetLookupLoading(false)
    setSelectedRecipientType(null)
    setError('')
    setSelectedCountryCurrency(null)
    setTransferType(null)
    setShowCurrencyDropdown(false)
    setShowProviderDropdown(false)
    setShowWalletAssetDropdown(false)
    setShowWalletNetworkDropdown(false)
    setShowScanModal(false)
    setProviderSearchTerm('')
    setWalletAssetSearchTerm('')
    setWalletNetworkSearchTerm('')
  }

  const mapFieldName = (fieldName: string): string => {
    const fieldMap: Record<string, string> = {
      account_name: "fullName",
      routing_number: "routingNumber",
      account_number: "accountNumber",
      bank_name: "bankName",
      sort_code: "sortCode",
      iban: "iban",
      swift_bic: "swiftBic",
    }
    return fieldMap[fieldName] || fieldName
  }

  const extractWalletAddress = (value: string): string => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const noQuery = raw.split('?')[0]
    if (noQuery.includes(':')) {
      const parts = noQuery.split(':')
      return parts[parts.length - 1] || raw
    }
    return noQuery
  }

  const handleScanPress = async () => {
    const perm = cameraPermission?.granted ? cameraPermission : await requestCameraPermission()
    if (!perm?.granted) {
      Alert.alert('Camera permission needed', 'Please enable camera permission to scan wallet address QR codes.')
      return
    }
    setShowScanModal(true)
  }

  const isFormValid = () => {
    if (selectedRecipientType === 'easenet') {
      return Boolean(easenetProfile && newRecipient.payeeEasetag.trim().length >= 1)
    }
    if (!newRecipient.fullName || !newRecipient.currency) return false

    if (selectedRecipientType === 'wallet') return !!newRecipient.network && !!newRecipient.walletAddress
    if (selectedRecipientType === 'mobile') return !!newRecipient.provider && !!newRecipient.phoneNumber

    if (selectedCountryCurrency?.countryCode === 'US' && !transferType) {
      return false
    }
    if (selectedCountryCurrency?.countryCode === 'US' && !newRecipient.checkingOrSavings) {
      return false
    }
    if (selectedCountryCurrency?.countryCode === 'US' && !newRecipient.addressLine1.trim()) {
      return false
    }

    const accountConfig = getAccountTypeConfigFromCurrency(newRecipient.currency)
    const requiredFields = accountConfig.requiredFields

    for (const field of requiredFields) {
      const formFieldName = mapFieldName(field)
      const fieldValue = newRecipient[formFieldName as keyof typeof newRecipient]
      if (!fieldValue || (typeof fieldValue === "string" && !fieldValue.trim())) {
        return false
      }
    }

    return true
  }

  const handleAddRecipient = async () => {
    if (!userProfile?.id) {
      Alert.alert('Error', 'User not authenticated')
      return
    }

    if (!isFormValid()) {
      Alert.alert('Error', 'Please fill in all required fields')
      return
    }

    try {
      setIsSubmitting(true)
      setError('')

      if (selectedRecipientType === 'easenet') {
        if (!easenetProfile) {
          Alert.alert('Error', 'Enter a valid Easetag and wait for the profile to load')
          return
        }
        const tag = easenetProfile.easetag
        const newRecipientData = await recipientService.create(userProfile.id, {
          fullName: easenetProfile.fullName,
          accountNumber: tag,
          bankName: `Easetag (@${tag})`,
          currency: 'USD',
          countryCode: 'US',
          payeeEasetag: tag,
          payeeAvatarUrl: easenetProfile.avatarUrl,
          payeeAccountKind: easenetProfile.accountKind,
        })
        if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
        setError('')
        resetForm()
        setShowBankAccountForm(false)
        setShowRecipientTypeModal(false)
        navigation.navigate('SendAmount' as never, {
          recipient: newRecipientData,
          fromSelectRecentRecipient: true,
          preferredBalanceCurrency: preferredBalanceCurrency === 'USD' || preferredBalanceCurrency === 'EUR'
            ? preferredBalanceCurrency
            : undefined,
          selectedPaymentMethod: routePaymentMethod,
          selectedOtherCurrency: routeOtherCurrency ?? null,
          selectedOtherPaymentMethod: routeOtherPaymentMethod ?? null,
        } as never)
        return
      }

      const accountNumberForType =
        selectedRecipientType === 'wallet'
          ? newRecipient.walletAddress
          : selectedRecipientType === 'mobile'
            ? newRecipient.phoneNumber
            : newRecipient.accountNumber
      const bankNameForType =
        selectedRecipientType === 'wallet'
          ? `Wallet (${newRecipient.currency}/${newRecipient.network})`
          : selectedRecipientType === 'mobile'
            ? `Mobile Money (${newRecipient.provider})`
            : newRecipient.bankName

      const newRecipientData = await recipientService.create(userProfile.id, {
        fullName: newRecipient.fullName,
        accountNumber: accountNumberForType,
        bankName: bankNameForType,
        currency: newRecipient.currency,
        countryCode: selectedCountryCurrency?.countryCode,
        phoneNumber: selectedRecipientType === 'mobile' ? newRecipient.phoneNumber : undefined,
        mobileProvider: selectedRecipientType === 'mobile' ? newRecipient.provider : undefined,
        walletNetwork: selectedRecipientType === 'wallet' ? newRecipient.network : undefined,
        walletMemoTag: selectedRecipientType === 'wallet' ? newRecipient.memoTag : undefined,
        routingNumber: newRecipient.routingNumber || undefined,
        sortCode: newRecipient.sortCode || undefined,
        iban: newRecipient.iban || undefined,
        swiftBic: newRecipient.swiftBic || undefined,
        transferType: selectedCountryCurrency?.countryCode === 'US' ? transferType || undefined : undefined,
        checkingOrSavings:
          selectedCountryCurrency?.countryCode === 'US' ? (newRecipient.checkingOrSavings as 'checking' | 'savings' | '') || undefined : undefined,
        addressLine1: selectedCountryCurrency?.countryCode === 'US' ? newRecipient.addressLine1 || undefined : undefined,
      })

      if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)

      setError('')
      resetForm()
      setShowBankAccountForm(false)
      setShowRecipientTypeModal(false)
      
      // Navigate to SendAmountScreen with the newly added recipient
      navigation.navigate('SendAmount' as never, {
        recipient: newRecipientData,
        fromSelectRecentRecipient: true,
        preferredBalanceCurrency: preferredBalanceCurrency === 'USD' || preferredBalanceCurrency === 'EUR'
          ? preferredBalanceCurrency
          : undefined,
        selectedPaymentMethod: routePaymentMethod,
        selectedOtherCurrency: routeOtherCurrency ?? null,
        selectedOtherPaymentMethod: routeOtherPaymentMethod ?? null,
      } as never)
    } catch (error) {
      console.error('Error adding recipient:', error)
      setError('Failed to add recipient')
      Alert.alert('Error', 'Failed to add recipient')
    } finally {
      setIsSubmitting(false)
    }
  }

  const recipientTypeKey =
    selectedRecipientType === 'mobile'
      ? 'mobile_money'
      : selectedRecipientType === 'easenet'
        ? 'bank'
        : (selectedRecipientType || 'bank')
  const filteredCurrencies = recipientCatalogFor(recipientTypeKey as RecipientType).filter((currency) => {
    if (currencySearchTerm) {
      return (
        currency.currencyName.toLowerCase().includes(currencySearchTerm.toLowerCase()) ||
        currency.currencyCode.toLowerCase().includes(currencySearchTerm.toLowerCase()) ||
        currency.countryName.toLowerCase().includes(currencySearchTerm.toLowerCase())
      )
    }
    return true
  })
  const selectedCatalogEntry =
    recipientCatalogFor(recipientTypeKey as RecipientType).find(
      (item) => item.currencyCode === newRecipient.currency && item.countryCode === selectedCountryCurrency?.countryCode,
    ) || recipientCatalogFor(recipientTypeKey as RecipientType).find((item) => item.currencyCode === newRecipient.currency)
  const isAnyDropdownOpen = showCurrencyDropdown || showProviderDropdown || showWalletAssetDropdown || showWalletNetworkDropdown
  const closeAllDropdowns = () => {
    setShowCurrencyDropdown(false)
    setShowProviderDropdown(false)
    setShowWalletAssetDropdown(false)
    setShowWalletNetworkDropdown(false)
  }
  const renderDropdownContainer = (onClose: () => void, content: React.ReactNode) => {
    if (Platform.OS === 'android') {
      const screenHeight = Dimensions.get('screen').height
      const keyboardOpen = androidDropdownKeyboardHeight > 0
      const maxHeight = Math.max(260, Math.floor(screenHeight * (keyboardOpen ? 0.5 : 0.62)))
      return (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={onClose}
          statusBarTranslucent
        >
          <Pressable style={styles.androidDropdownOverlay} onPress={onClose} />
          <View style={styles.androidDropdownContainer} pointerEvents="box-none">
            <View style={[styles.androidDropdownCard, { maxHeight }]}>{content}</View>
          </View>
        </Modal>
      )
    }
    return <View style={styles.currencyDropdown}>{content}</View>
  }

  const renderRecipient = ({ item }: { item: Recipient }) => {
    const isDraftEasenet = isDraftEasenetRecipient(item.id)
    const showRecentBadge = recentIds.has(item.id) && !isDraftEasenet
    const isEasenet = isEasenetRecipientRecord(item)
    return (
      <Pressable
       android_ripple={ripple.neutral}
        style={styles.recipientItem}
        onPress={() => handleSelectRecipient(item)} >
        <View style={styles.recipientRow}>
          {isEasenet ? (
            <>
              <EasenetRecipientHydratedPreview
                recipient={item}
                variant="row"
                getInitials={getInitials}
                titleEndAccessory={
                  <>
                    {showRecentBadge ? (
                      <View style={[styles.recentBadge, styles.recipientMetaBadge]}>
                        <Text style={styles.recentBadgeText}>Recent</Text>
                      </View>
                    ) : null}
                    {isDraftEasenet ? (
                      <View style={[styles.newRecipientBadge, styles.recipientMetaBadge]}>
                        <Text style={styles.newRecipientBadgeText}>New</Text>
                      </View>
                    ) : null}
                  </>
                }
              />
              <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
            </>
          ) : (
            <>
              <RecipientPayoutPreview
                recipient={item}
                variant="row"
                getInitials={getInitials}
                titleEndAccessory={
                  <>
                    {showRecentBadge ? (
                      <View style={[styles.recentBadge, styles.recipientMetaBadge]}>
                        <Text style={styles.recentBadgeText}>Recent</Text>
                      </View>
                    ) : null}
                    {isDraftEasenet ? (
                      <View style={[styles.newRecipientBadge, styles.recipientMetaBadge]}>
                        <Text style={styles.newRecipientBadgeText}>New</Text>
                      </View>
                    ) : null}
                  </>
                }
              />
              <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
            </>
          )}
        </View>
      </Pressable>
    )
  }

  const listHeader = (
    <>
      <Animated.View
        style={[
          styles.header,
          {
            opacity: headerAnim,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-motion.screenEnterTranslateY, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
         android_ripple={ripple.neutral}
          onPress={() => {
            navigation.navigate('MainTabs' as never)
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
          styles.searchContainer,
          {
            opacity: contentAnim,
            transform: [
              {
                translateY: contentAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [motion.screenEnterTranslateY, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.searchWrapper}>
          <Search size={18} color={colors.primary.main} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search @easetag or recipients"
            placeholderTextColor={colors.text.secondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {searchTerm.trim().startsWith('@') && hubSearchLoading ? (
            <ActivityIndicator size="small" color={colors.primary.main} />
          ) : null}
          {searchTerm.length > 0 && !(searchTerm.trim().startsWith('@') && hubSearchLoading) ? (
            <Pressable android_ripple={ripple.neutral} onPress={() => setSearchTerm('')}>
              <Ionicons name="close-circle" size={18} color={colors.primary.main} />
            </Pressable>
          ) : null}
        </View>
        {searchTerm.trim().startsWith('@') && hubSearchError && !hubSearchLoading && !hubVirtualRecipient ? (
          <Text style={styles.searchErrorText}>{hubSearchError}</Text>
        ) : null}
      </Animated.View>
    </>
  )

  const listEmpty = (
    <Animated.View
      style={[
        styles.emptyState,
        {
          opacity: contentAnim,
          transform: [
            {
              translateY: contentAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [motion.screenEnterTranslateY, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.emptyIconContainer}>
        <Ionicons name="people-outline" size={48} color={colors.text.secondary} />
      </View>
      <Text style={styles.emptyTitle}>{searchTerm.trim() ? 'No matches' : 'No recipients yet'}</Text>
      <Text style={styles.emptyText}>
        {searchTerm.trim() ? 'Try another search' : 'Add a recipient to send money'}
      </Text>
    </Animated.View>
  )

  const screenBody = (
    <>
      <View style={styles.container}>
        {recipientsLoading && recipients.length === 0 ? (
          <View style={[styles.scrollContent, { paddingTop: spacing[4] }]}>
            {[1, 2, 3, 4].map((i) => (
              <ShimmerLoader
                key={i}
                width="100%"
                height={88}
                borderRadius={borderRadius.xl}
                style={{ marginBottom: spacing[3] }}
              />
            ))}
          </View>
        ) : (
          <FlatList
            data={sendHubFlatListData}
            renderItem={renderRecipient}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 100, flexGrow: 1 },
            ]}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Add a recipient Button - Fixed at bottom */}
        <View style={[styles.bottomButtonContainer, { paddingBottom: insets.bottom + spacing[4] }]}>
          <Pressable
           android_ripple={ripple.neutral}
            style={styles.addRecipientButton}
            onPress={handleAddNewRecipient} >
            <Text style={styles.addRecipientButtonText}>Add a recipient</Text>
          </Pressable>
        </View>
      </View>

      {/* Step 1: Recipient Type Selection Modal */}
      <Modal
        visible={showRecipientTypeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowRecipientTypeModal(false)
          resetForm()
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <Pressable 
           android_ripple={ripple.neutral} 
            style={StyleSheet.absoluteFill} onPress={() => {
              setShowRecipientTypeModal(false)
              resetForm()
            }}
          />
          <View style={[styles.modalContainer, styles.recipientTypeModal, { 
            paddingBottom: Math.max(insets.bottom, 20),
          }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add a new</Text>
              <Pressable
               android_ripple={ripple.neutral}
                onPress={() => {
                  setShowRecipientTypeModal(false)
                  resetForm()
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <View style={styles.recipientTypeOptions}>
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.recipientTypeOption}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  const firstAsset = getWalletAssets()[0] || 'USDT'
                  const firstNetwork = getWalletNetworksForAsset(firstAsset)[0] || ''
                  setSelectedRecipientType('wallet')
                  setNewRecipient(prev => ({ ...prev, currency: firstAsset, network: firstNetwork }))
                  setShowRecipientTypeModal(false)
                  setShowBankAccountForm(true)
                }} >
                <View style={styles.recipientTypeIcon}>
                  <Wallet size={24} color={colors.primary.main} strokeWidth={2} />
                </View>
                <View style={styles.recipientTypeContent}>
                  <Text style={styles.recipientTypeTitle}>Wallet Address</Text>
                  <Text style={styles.recipientTypeSubtitle}>Send stablecoins to an address</Text>
                </View>
              </Pressable>

              <Pressable
               android_ripple={ripple.neutral}
                style={styles.recipientTypeOption}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  setSelectedRecipientType('bank')
                  setSelectedCountryCurrency({
                    countryCode: 'US',
                    countryName: 'United States',
                    currencyCode: 'USD',
                    currencyName: 'US Dollar',
                    flagEmoji: '',
                  })
                  setNewRecipient(prev => ({ ...prev, currency: 'USD' }))
                  setShowRecipientTypeModal(false)
                  setShowBankAccountForm(true)
                }} >
                <View style={styles.recipientTypeIcon}>
                  <Building2 size={24} color={colors.primary.main} strokeWidth={2} />
                </View>
                <View style={styles.recipientTypeContent}>
                  <Text style={styles.recipientTypeTitle}>Bank Account</Text>
                  <Text style={styles.recipientTypeSubtitle}>Send cash to a bank account</Text>
                </View>
              </Pressable>

              <Pressable
               android_ripple={ripple.neutral}
                style={styles.recipientTypeOption}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  const firstMobile = recipientCatalogFor('mobile_money')[0]
                  const firstCurrency = firstMobile?.currencyCode || 'KES'
                  const firstProvider = getRecipientProviders(firstCurrency, 'mobile_money', firstMobile?.countryCode)[0] || ''
                  setSelectedRecipientType('mobile')
                  setSelectedCountryCurrency({
                    countryCode: firstMobile?.countryCode || 'KE',
                    countryName: firstMobile?.countryName || 'Kenya',
                    currencyCode: firstCurrency,
                    currencyName: firstMobile?.currencyName || 'Kenyan Shilling',
                    flagEmoji: '',
                  })
                  setNewRecipient(prev => ({ ...prev, currency: firstCurrency, provider: firstProvider }))
                  setShowRecipientTypeModal(false)
                  setShowBankAccountForm(true)
                }} >
                <View style={styles.recipientTypeIcon}>
                  <Smartphone size={24} color={colors.primary.main} strokeWidth={2} />
                </View>
                <View style={styles.recipientTypeContent}>
                  <Text style={styles.recipientTypeTitle}>Mobile Money</Text>
                  <Text style={styles.recipientTypeSubtitle}>Send cash via mobile money</Text>
                </View>
              </Pressable>

              <Pressable
               android_ripple={ripple.neutral}
                style={styles.recipientTypeOption}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  setSelectedRecipientType('easenet')
                  setEasenetProfile(null)
                  setEasenetLookupError(null)
                  setSelectedCountryCurrency({
                    countryCode: 'US',
                    countryName: 'United States',
                    currencyCode: 'USD',
                    currencyName: 'US Dollar',
                    flagEmoji: '',
                  })
                  setNewRecipient((prev) => ({
                    ...prev,
                    currency: 'USD',
                    payeeEasetag: '',
                    fullName: '',
                    bankName: '',
                    accountNumber: '',
                  }))
                  setShowRecipientTypeModal(false)
                  setShowBankAccountForm(true)
                }} >
                <View style={styles.recipientTypeIcon}>
                  <AtSign size={24} color={colors.primary.main} strokeWidth={2} />
                </View>
                <View style={styles.recipientTypeContent}>
                  <Text style={styles.recipientTypeTitle}>Easetag</Text>
                  <Text style={styles.recipientTypeSubtitle}>Send cash via Easner handle</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Step 2: Bank Account Form Modal */}
      <Modal
        visible={showBankAccountForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowBankAccountForm(false)
          resetForm()
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <Pressable 
           android_ripple={ripple.neutral} 
            style={StyleSheet.absoluteFill} onPress={() => {
              setShowBankAccountForm(false)
              resetForm()
            }}
          />
          <View 
            style={[styles.modalContainer, { 
              height: '92%',
              paddingBottom: Math.max(insets.bottom, 20),
            }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedRecipientType === 'wallet'
                  ? 'Add Wallet Address'
                  : selectedRecipientType === 'mobile'
                    ? 'Add Mobile Money'
                    : selectedRecipientType === 'easenet'
                      ? 'Add Easetag recipient'
                      : 'Add Bank Account'}
              </Text>
              <Pressable
               android_ripple={ripple.neutral}
                onPress={() => {
                  setShowBankAccountForm(false)
                  resetForm()
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
              /** When a dropdown is open, pause the form scroll so the dropdown list receives vertical drags (Android + iOS). */
              scrollEnabled={!isAnyDropdownOpen}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalContent}>
              {isAnyDropdownOpen && Platform.OS !== 'android' && (
                <Pressable android_ripple={ripple.neutral} style={styles.dropdownBackdrop} onPress={closeAllDropdowns} />
              )}
              
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              
            {selectedRecipientType === 'easenet' && (
              <>
                <View style={[styles.searchWrapper, styles.easenetHandleRowMargin]}>
                  <Text style={styles.easenetAtPrefix}>@</Text>
                  <TextInput
                    style={styles.searchInput}
                    value={newRecipient.payeeEasetag}
                    onChangeText={(text) =>
                      setNewRecipient((prev) => ({ ...prev, payeeEasetag: text.replace(/^@+/, '') }))
                    }
                    placeholder="handle"
                    placeholderTextColor={colors.text.secondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSubmitting}
                    underlineColorAndroid="transparent"
                  />
                  {easenetLookupLoading ? (
                    <ActivityIndicator size="small" color={colors.primary.main} />
                  ) : null}
                </View>
                {easenetLookupError ? <Text style={styles.errorText}>{easenetLookupError}</Text> : null}
                {easenetProfile ? (
                  <EasenetLookupPreview
                    profile={{
                      fullName: easenetProfile.fullName,
                      easetag: easenetProfile.easetag,
                      accountKind: easenetProfile.accountKind,
                      avatarUrl: easenetProfile.avatarUrl,
                    }}
                    getInitials={getInitials}
                  />
                ) : null}
              </>
            )}

            {/* Country/Currency Selector */}
            {selectedRecipientType !== 'wallet' && selectedRecipientType !== 'easenet' && (
            <View style={[styles.currencySelectorWrapper, showCurrencyDropdown && styles.currencySelectorWrapperActive]}>
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.currencySelector}
                onPress={() => {
                  setShowCurrencyDropdown(!showCurrencyDropdown)
                  setCurrencySearchTerm('')
                }} >
                <View style={styles.currencySelectorContent}>
                  {selectedCatalogEntry ? (
                    <CountryFlag code={selectedCatalogEntry.countryCode} size={22} style={styles.currencyFlag} />
                  ) : (
                    <CurrencyFlag currency={newRecipient.currency} size={22} style={styles.currencyFlag} />
                  )}
                  <Text style={styles.currencySelectorText}>
                    {selectedCatalogEntry ? `${newRecipient.currency} - ${selectedCatalogEntry.countryName}` : 'Select currency'}
                  </Text>
                  <Ionicons 
                    name={showCurrencyDropdown ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color="#6F756F" 
                  />
                </View>
              </Pressable>
              
              {showCurrencyDropdown &&
                renderDropdownContainer(
                  () => {
                    setShowCurrencyDropdown(false)
                    setCurrencySearchTerm('')
                  },
                  <>
                  <View style={styles.currencyDropdownSearch}>
                    <Ionicons name="search" size={18} color={colors.neutral[400]} />
                    <TextInput
                      style={styles.currencyDropdownSearchInput}
                      placeholder="Search currencies..."
                      placeholderTextColor={colors.neutral[400]}
                      value={currencySearchTerm}
                      onChangeText={setCurrencySearchTerm}
                    />
                  </View>
                  <RecipientFormDropdownList>
                    {filteredCurrencies.map((item) => {
                      const isSelected =
                        newRecipient.currency === item.currencyCode &&
                        selectedCountryCurrency?.countryCode === item.countryCode
                      return (
                        <Pressable
                          key={`${item.countryCode}-${item.currencyCode}`}
                          android_ripple={ripple.neutral}
                          style={[styles.currencyDropdownItem, isSelected && styles.currencyDropdownItemSelected]}
                          onPress={async () => {
                            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                            setSelectedCountryCurrency({
                              countryCode: item.countryCode,
                              countryName: item.countryName,
                              currencyCode: item.currencyCode,
                              currencyName: item.currencyName,
                              flagEmoji: '',
                            })
                            setTransferType(null)
                            const firstProvider =
                              getRecipientProviders(item.currencyCode, 'mobile_money', item.countryCode)[0] || ''
                            setNewRecipient((prev) => ({
                              ...prev,
                              currency: item.currencyCode,
                              provider: selectedRecipientType === 'mobile' ? firstProvider : prev.provider,
                            }))
                            setShowCurrencyDropdown(false)
                            setCurrencySearchTerm('')
                          }}
                        >
                          <CountryFlag code={item.countryCode} size={22} style={styles.currencyFlag} />
                          <View style={styles.currencyInfo}>
                            <Text style={styles.currencyCode}>{item.currencyCode}</Text>
                            <Text style={styles.currencyName}>{item.countryName}</Text>
                          </View>
                          {isSelected ? (
                            <Ionicons name="checkmark" size={18} color={colors.primary.main} />
                          ) : null}
                        </Pressable>
                      )
                    })}
                  </RecipientFormDropdownList>
                  </>,
                )}
            </View>
            )}

              {selectedRecipientType === 'mobile' && (
                <>
                  <View style={[styles.currencySelectorWrapper, showProviderDropdown && styles.currencySelectorWrapperActive]}>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={styles.currencySelector}
                      onPress={() => {
                        setShowProviderDropdown(!showProviderDropdown)
                        setShowCurrencyDropdown(false)
                        setShowWalletAssetDropdown(false)
                        setShowWalletNetworkDropdown(false)
                      }} disabled={isSubmitting}
                    >
                      <View style={styles.currencySelectorContent}>
                        <Text style={styles.currencySelectorText}>
                          {newRecipient.provider || 'Select provider'}
                        </Text>
                        <Ionicons name={showProviderDropdown ? "chevron-up" : "chevron-down"} size={16} color="#6F756F" />
                      </View>
                    </Pressable>
                    {showProviderDropdown &&
                      renderDropdownContainer(
                        () => {
                          setShowProviderDropdown(false)
                          setProviderSearchTerm('')
                        },
                        <>
                        <View style={styles.currencyDropdownSearch}>
                          <Ionicons name="search" size={18} color={colors.neutral[400]} />
                          <TextInput
                            style={styles.currencyDropdownSearchInput}
                            placeholder="Search providers..."
                            placeholderTextColor={colors.neutral[400]}
                            value={providerSearchTerm}
                            onChangeText={setProviderSearchTerm}
                          />
                        </View>
                        <RecipientFormDropdownList>
                          {getRecipientProviders(
                            newRecipient.currency,
                            'mobile_money',
                            selectedCountryCurrency?.countryCode,
                          )
                            .filter((provider) =>
                              provider.toLowerCase().includes(providerSearchTerm.toLowerCase()),
                            )
                            .map((provider) => (
                              <Pressable
                                key={provider}
                                android_ripple={ripple.neutral}
                                style={[
                                  styles.currencyDropdownItem,
                                  newRecipient.provider === provider && styles.currencyDropdownItemSelected,
                                ]}
                                onPress={async () => {
                                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                  setNewRecipient((prev) => ({ ...prev, provider }))
                                  setShowProviderDropdown(false)
                                  setProviderSearchTerm('')
                                }}
                              >
                                <View style={styles.currencyInfo}>
                                  <Text style={styles.currencyCode}>{provider}</Text>
                                </View>
                                {newRecipient.provider === provider ? (
                                  <Ionicons name="checkmark" size={18} color={colors.primary.main} />
                                ) : null}
                              </Pressable>
                            ))}
                        </RecipientFormDropdownList>
                        </>,
                      )}
            </View>
                  <TextInput
                    style={styles.modalInput}
                    value={newRecipient.fullName}
                    onChangeText={(text) => setNewRecipient(prev => ({ ...prev, fullName: text }))}
                    placeholder="Account name"
                    placeholderTextColor={colors.text.secondary}
                    editable={!isSubmitting}
                  />
                  <TextInput
                    style={styles.modalInput}
                    value={newRecipient.phoneNumber}
                    onChangeText={(text) => setNewRecipient(prev => ({ ...prev, phoneNumber: text }))}
                    placeholder="Phone number"
                    placeholderTextColor={colors.text.secondary}
                    keyboardType="phone-pad"
                    editable={!isSubmitting}
                  />
                </>
              )}

              {selectedRecipientType === 'wallet' && (
                <>
                  <TextInput
                    style={styles.modalInput}
                    value={newRecipient.fullName}
                    onChangeText={(text) => setNewRecipient(prev => ({ ...prev, fullName: text }))}
                    placeholder="Address nickname"
                    placeholderTextColor={colors.text.secondary}
                    editable={!isSubmitting}
                  />
                  <View style={[styles.currencySelectorWrapper, showWalletAssetDropdown && styles.currencySelectorWrapperActive]}>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={styles.currencySelector}
                      onPress={() => {
                        setShowWalletAssetDropdown(!showWalletAssetDropdown)
                        setShowWalletNetworkDropdown(false)
                      }} disabled={isSubmitting}
                    >
                      <View style={styles.currencySelectorContent}>
                        {getTokenIconUrl(newRecipient.currency) ? <Image source={{ uri: getTokenIconUrl(newRecipient.currency)! }} style={styles.cryptoIcon} /> : null}
                        <Text style={styles.currencySelectorText}>
                          {newRecipient.currency || 'Select asset'}
                        </Text>
                        <Ionicons name={showWalletAssetDropdown ? "chevron-up" : "chevron-down"} size={16} color="#6F756F" />
                      </View>
                    </Pressable>
                    {showWalletAssetDropdown &&
                      renderDropdownContainer(
                        () => {
                          setShowWalletAssetDropdown(false)
                          setWalletAssetSearchTerm('')
                        },
                        <>
                        <View style={styles.currencyDropdownSearch}>
                          <Ionicons name="search" size={18} color={colors.neutral[400]} />
                          <TextInput
                            style={styles.currencyDropdownSearchInput}
                            placeholder="Search asset..."
                            placeholderTextColor={colors.neutral[400]}
                            value={walletAssetSearchTerm}
                            onChangeText={setWalletAssetSearchTerm}
                          />
                        </View>
                        <RecipientFormDropdownList>
                          {getWalletAssets()
                            .filter((asset) =>
                              asset.toLowerCase().includes(walletAssetSearchTerm.toLowerCase()),
                            )
                            .map((asset) => (
                              <Pressable
                                key={asset}
                                android_ripple={ripple.neutral}
                                style={[
                                  styles.currencyDropdownItem,
                                  newRecipient.currency === asset && styles.currencyDropdownItemSelected,
                                ]}
                                onPress={async () => {
                                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                  const networks = getWalletNetworksForAsset(asset)
                                  setNewRecipient((prev) => ({
                                    ...prev,
                                    currency: asset,
                                    network: networks[0] || '',
                                  }))
                                  setShowWalletAssetDropdown(false)
                                  setWalletAssetSearchTerm('')
                                }}
                              >
                                {getTokenIconUrl(asset) ? (
                                  <Image source={{ uri: getTokenIconUrl(asset)! }} style={styles.cryptoIcon} />
                                ) : null}
                                <View style={styles.currencyInfo}>
                                  <Text style={styles.currencyCode}>{asset}</Text>
                                </View>
                                {newRecipient.currency === asset ? (
                                  <Ionicons name="checkmark" size={18} color={colors.primary.main} />
                                ) : null}
                              </Pressable>
                            ))}
                        </RecipientFormDropdownList>
                        </>,
                      )}
                  </View>
                  <View style={[styles.currencySelectorWrapper, showWalletNetworkDropdown && styles.currencySelectorWrapperActive]}>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={styles.currencySelector}
                      onPress={() => {
                        if (!isSubmitting) {
                          setShowWalletNetworkDropdown(!showWalletNetworkDropdown)
                          setShowWalletAssetDropdown(false)
                        }
                      }} disabled={isSubmitting}
                    >
                      <View style={styles.currencySelectorContent}>
                        {getNetworkIconUrl(newRecipient.network) ? <Image source={{ uri: getNetworkIconUrl(newRecipient.network)! }} style={styles.cryptoIcon} /> : null}
                        <Text style={styles.currencySelectorText}>
                          {newRecipient.network || 'Select network'}
                        </Text>
                        <Ionicons name={showWalletNetworkDropdown ? "chevron-up" : "chevron-down"} size={16} color="#6F756F" />
                      </View>
                    </Pressable>
                    {showWalletNetworkDropdown &&
                      renderDropdownContainer(
                        () => {
                          setShowWalletNetworkDropdown(false)
                          setWalletNetworkSearchTerm('')
                        },
                        <>
                        <View style={styles.currencyDropdownSearch}>
                          <Ionicons name="search" size={18} color={colors.neutral[400]} />
                          <TextInput
                            style={styles.currencyDropdownSearchInput}
                            placeholder="Search network..."
                            placeholderTextColor={colors.neutral[400]}
                            value={walletNetworkSearchTerm}
                            onChangeText={setWalletNetworkSearchTerm}
                          />
                        </View>
                        <RecipientFormDropdownList>
                          {getWalletNetworksForAsset(newRecipient.currency)
                            .filter((network) =>
                              network.toLowerCase().includes(walletNetworkSearchTerm.toLowerCase()),
                            )
                            .map((network) => (
                              <Pressable
                                key={network}
                                android_ripple={ripple.neutral}
                                style={[
                                  styles.currencyDropdownItem,
                                  newRecipient.network === network && styles.currencyDropdownItemSelected,
                                ]}
                                onPress={async () => {
                                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                  setNewRecipient((prev) => ({ ...prev, network }))
                                  setShowWalletNetworkDropdown(false)
                                  setWalletNetworkSearchTerm('')
                                }}
                              >
                                {getNetworkIconUrl(network) ? (
                                  <Image source={{ uri: getNetworkIconUrl(network)! }} style={styles.cryptoIcon} />
                                ) : null}
                                <View style={styles.currencyInfo}>
                                  <Text style={styles.currencyCode}>{network}</Text>
                                </View>
                                {newRecipient.network === network ? (
                                  <Ionicons name="checkmark" size={18} color={colors.primary.main} />
                                ) : null}
                              </Pressable>
                            ))}
                        </RecipientFormDropdownList>
                        </>,
                      )}
                  </View>
                  <View style={styles.walletAddressInputWrap}>
                    <TextInput
                      style={[styles.modalInput, styles.walletAddressInput]}
                      value={newRecipient.walletAddress}
                      onChangeText={(text) => setNewRecipient(prev => ({ ...prev, walletAddress: text }))}
                      placeholder="Wallet Address"
                      placeholderTextColor={colors.text.secondary}
                      editable={!isSubmitting}
                    />
                    <Pressable android_ripple={ripple.neutral} style={styles.walletScanIconButton} onPress={handleScanPress} >
                      <Ionicons name="scan-outline" size={18} color={colors.primary.main} />
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.modalInput}
                    value={newRecipient.memoTag}
                    onChangeText={(text) => setNewRecipient(prev => ({ ...prev, memoTag: text }))}
                    placeholder="Memo / Tag (optional)"
                    placeholderTextColor={colors.text.secondary}
                    editable={!isSubmitting}
                  />
                </>
              )}

              {selectedRecipientType === 'bank' && (() => {
                const accountConfig = newRecipient.currency
                  ? getAccountTypeConfigFromCurrency(newRecipient.currency)
                  : null

                if (!accountConfig) {
                  return (
                    <View style={styles.infoBox}>
                      <Text style={styles.infoText}>Please select a currency first to see the required fields</Text>
                    </View>
                  )
                }

                return (
                  <>
                    {/* Transfer Type Selection - First field for US accounts */}
                    {accountConfig.accountType === "us" && (
                      <View style={styles.transferTypeContainer}>
                        <View style={styles.transferTypeOptions}>
                          <Pressable
                           android_ripple={ripple.neutral}
                            style={[styles.transferTypeOption, transferType === 'ACH' && styles.transferTypeOptionSelected]}
                            onPress={() => {
                              setTransferType('ACH')
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                            }} >
                            <Text style={[styles.transferTypeOptionText, transferType === 'ACH' && styles.transferTypeOptionTextSelected]}>
                              ACH
                            </Text>
                          </Pressable>
                          <Pressable
                           android_ripple={ripple.neutral}
                            style={[styles.transferTypeOption, transferType === 'Wire' && styles.transferTypeOptionSelected]}
                            onPress={() => {
                              setTransferType('Wire')
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                            }} >
                            <Text style={[styles.transferTypeOptionText, transferType === 'Wire' && styles.transferTypeOptionTextSelected]}>
                              Fedwire
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    )}

                    {/* Account Name */}
                    <View>
                      <TextInput
                        style={styles.modalInput}
                        value={newRecipient.fullName}
                        onChangeText={(text) => setNewRecipient(prev => ({ ...prev, fullName: text }))}
                        placeholder="Account name"
                        placeholderTextColor={colors.text.secondary}
                        autoCapitalize="words"
                        returnKeyType="done"
                        onSubmitEditing={() => Keyboard.dismiss()}
                        editable={!isSubmitting}
                      />
                    </View>

                    {/* Bank Name */}
                    <View>
                      <TextInput
                        style={styles.modalInput}
                        value={newRecipient.bankName}
                        onChangeText={(text) => setNewRecipient(prev => ({ ...prev, bankName: text }))}
                        placeholder={`${accountConfig.fieldLabels.bank_name} *`}
                        placeholderTextColor={colors.text.secondary}
                        autoCapitalize="words"
                        returnKeyType="done"
                        onSubmitEditing={() => Keyboard.dismiss()}
                        editable={!isSubmitting}
                      />
                    </View>

                    {/* US Account Fields */}
                    {accountConfig.accountType === "us" && (
                      <>
                        <View style={styles.transferTypeContainer}>
                          <View style={styles.transferTypeOptions}>
                            <Pressable
                             android_ripple={ripple.neutral}
                              style={[styles.transferTypeOption, newRecipient.checkingOrSavings === 'checking' && styles.transferTypeOptionSelected]}
                              onPress={() => {
                                setNewRecipient(prev => ({ ...prev, checkingOrSavings: 'checking' }))
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                              }} >
                              <Text style={[styles.transferTypeOptionText, newRecipient.checkingOrSavings === 'checking' && styles.transferTypeOptionTextSelected]}>
                                Checking
                              </Text>
                            </Pressable>
                            <Pressable
                             android_ripple={ripple.neutral}
                              style={[styles.transferTypeOption, newRecipient.checkingOrSavings === 'savings' && styles.transferTypeOptionSelected]}
                              onPress={() => {
                                setNewRecipient(prev => ({ ...prev, checkingOrSavings: 'savings' }))
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                              }} >
                              <Text style={[styles.transferTypeOptionText, newRecipient.checkingOrSavings === 'savings' && styles.transferTypeOptionTextSelected]}>
                                Savings
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.addressLine1}
                            onChangeText={(text) => setNewRecipient(prev => ({ ...prev, addressLine1: text }))}
                            placeholder="Address *"
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="words"
                            editable={!isSubmitting}
                          />
                        </View>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.routingNumber}
                            onChangeText={(text) => {
                              const formatted = formatRoutingNumber(text)
                              setNewRecipient(prev => ({ ...prev, routingNumber: formatted }))
                            }}
                            placeholder={`${accountConfig.fieldLabels.routing_number} *`}
                            placeholderTextColor={colors.text.secondary}
                            keyboardType="number-pad"
                            maxLength={9}
                            autoComplete="off"
                            autoCorrect={false}
                            textContentType="none"
                            editable={!isSubmitting}
                          />
                        </View>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.accountNumber}
                            onChangeText={(text) => {
                              const formatted = formatAccountNumber(text)
                              setNewRecipient(prev => ({ ...prev, accountNumber: formatted }))
                            }}
                            placeholder={`${accountConfig.fieldLabels.account_number} *`}
                            placeholderTextColor={colors.text.secondary}
                            keyboardType="number-pad"
                            autoComplete="off"
                            autoCorrect={false}
                            textContentType="none"
                            editable={!isSubmitting}
                          />
                        </View>
                      </>
                    )}

                    {/* UK Account Fields */}
                    {accountConfig.accountType === "uk" && (
                      <>
                        <View style={styles.twoColumnRow}>
                          <View style={styles.halfInput}>
                            <TextInput
                              style={styles.modalInput}
                              value={newRecipient.sortCode}
                              onChangeText={(text) => {
                                const formatted = formatSortCode(text)
                                setNewRecipient(prev => ({ ...prev, sortCode: formatted }))
                              }}
                              placeholder={`${accountConfig.fieldLabels.sort_code} *`}
                              placeholderTextColor={colors.text.secondary}
                              keyboardType="number-pad"
                              maxLength={8}
                              autoComplete="off"
                              autoCorrect={false}
                              textContentType="none"
                              editable={!isSubmitting}
                            />
                          </View>
                          <View style={styles.halfInput}>
                            <TextInput
                              style={styles.modalInput}
                              value={newRecipient.accountNumber}
                              onChangeText={(text) => {
                                const formatted = formatAccountNumber(text)
                                setNewRecipient(prev => ({ ...prev, accountNumber: formatted }))
                              }}
                              placeholder={`${accountConfig.fieldLabels.account_number} *`}
                              placeholderTextColor={colors.text.secondary}
                              keyboardType="number-pad"
                              autoComplete="off"
                              autoCorrect={false}
                              textContentType="none"
                              editable={!isSubmitting}
                            />
                          </View>
                        </View>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.iban}
                            onChangeText={(text) => {
                              const formatted = formatIBAN(text)
                              setNewRecipient(prev => ({ ...prev, iban: formatted }))
                            }}
                            placeholder={accountConfig.fieldLabels.iban}
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="characters"
                            returnKeyType="done"
                            onSubmitEditing={() => Keyboard.dismiss()}
                            editable={!isSubmitting}
                          />
                        </View>
                        <TextInput
                          style={styles.modalInput}
                          value={newRecipient.swiftBic}
                          onChangeText={(text) => setNewRecipient(prev => ({ ...prev, swiftBic: text.toUpperCase() }))}
                          placeholder={accountConfig.fieldLabels.swift_bic}
                          placeholderTextColor={colors.text.secondary}
                          autoCapitalize="characters"
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                          editable={!isSubmitting}
                        />
                      </>
                    )}

                    {/* EURO Account Fields */}
                    {accountConfig.accountType === "euro" && (
                      <>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.iban}
                            onChangeText={(text) => {
                              const formatted = formatIBAN(text)
                              setNewRecipient(prev => ({ ...prev, iban: formatted }))
                            }}
                            placeholder={`${accountConfig.fieldLabels.iban} *`}
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="characters"
                            returnKeyType="done"
                            onSubmitEditing={() => Keyboard.dismiss()}
                            editable={!isSubmitting}
                          />
                        </View>
                        <View>
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.swiftBic}
                            onChangeText={(text) => setNewRecipient(prev => ({ ...prev, swiftBic: text.toUpperCase() }))}
                            placeholder={accountConfig.fieldLabels.swift_bic}
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="characters"
                            returnKeyType="done"
                            onSubmitEditing={() => Keyboard.dismiss()}
                            editable={!isSubmitting}
                          />
                        </View>
                      </>
                    )}

                    {/* Generic Account Fields */}
                    {accountConfig.accountType === "generic" && (
                      <View>
                        <TextInput
                          style={styles.modalInput}
                          value={newRecipient.accountNumber}
                          onChangeText={(text) => {
                            const formatted = formatAccountNumber(text)
                            setNewRecipient(prev => ({ ...prev, accountNumber: formatted }))
                          }}
                          placeholder={`${accountConfig.fieldLabels.account_number} *`}
                          placeholderTextColor={colors.text.secondary}
                          keyboardType="number-pad"
                          autoComplete="off"
                          autoCorrect={false}
                          textContentType="none"
                          editable={!isSubmitting}
                        />
                      </View>
                    )}
                  </>
                )
              })()}

              <View style={styles.modalButtons}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowBankAccountForm(false)
                    setError('')
                    resetForm()
                  }}
                  disabled={isSubmitting}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={[styles.modalButton, styles.saveButton, (isSubmitting || !isFormValid()) && styles.disabledButton]}
                  onPress={handleAddRecipient}
                  disabled={isSubmitting || !isFormValid()}
                >
                  <Text style={styles.saveButtonText}>
                    {isSubmitting ? 'Adding...' : 'Add'}
                  </Text>
                </Pressable>
              </View>
              </View>
            </ScrollView>
            {showScanModal && (
              <View style={styles.scanOverlay}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => {
                    const address = extractWalletAddress(data)
                    if (!address) return
                    setNewRecipient(prev => ({ ...prev, walletAddress: address }))
                    setShowScanModal(false)
                  }}
                />
                <View style={styles.scanUiLayer}>
                  <View style={styles.scanHeaderRow}>
                    <Text style={styles.scanTitle}>Scan wallet address</Text>
                    <Pressable android_ripple={ripple.neutral} style={styles.scanCloseButton} onPress={() => setShowScanModal(false)}>
                      <Ionicons name="close" size={22} color={colors.text.inverse} />
                    </Pressable>
                  </View>
                  <View style={styles.scanCenterGroup}>
                    <View style={styles.scanFrame} />
                    <Text style={styles.scanHint}>Align QR code inside the frame</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )

  return (
    <ScreenWrapper>
      {Platform.OS === 'android' ? (
        screenBody
      ) : (
        <KeyboardSafeContainer>{screenBody}</KeyboardSafeContainer>
      )}
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 0,
    paddingHorizontal: spacing[5],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  searchContainer: {
    marginBottom: spacing[4],
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
    ...Platform.select({
      ios: { paddingVertical: spacing[3] },
      android: { paddingVertical: spacing[2], minHeight: 44 },
    }),
    gap: spacing[2],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  searchInput: {
    flex: 1,
    ...textStyles.textInputMedium,
    color: colors.text.primary,
    ...Platform.select({
      ios: { paddingVertical: 0 },
      android: {
        paddingVertical: 0,
        includeFontPadding: false,
      },
    }),
  },
  easenetHandleRowMargin: {
    marginBottom: spacing[2],
  },
  easenetAtPrefix: {
    ...textStyles.textInputMedium,
    color: colors.primary.main,
  },
  searchErrorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    fontFamily: 'Outfit-Regular',
    marginTop: spacing[2],
    paddingHorizontal: spacing[1],
  },
  recipientSelectorContainer: {
    paddingHorizontal: spacing[5],
    marginBottom: spacing[4],
  },
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
  sectionTitleContainer: {
    paddingHorizontal: spacing[5],
    marginBottom: spacing[3],
    marginTop: spacing[2],
  },
  sectionTitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Medium',
  },
  recipientsContainer: {
    paddingHorizontal: spacing[5],
  },
  recipientItem: {
    backgroundColor: '#F9F9F9',
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    overflow: 'visible',
    marginRight: spacing[3],
  },
  recipientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  recipientAvatarPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  recipientAvatarText: {
    ...textStyles.titleMedium,
    color: colors.primary.main,
    fontFamily: 'Outfit-SemiBold',
    fontWeight: '700',
  },
  avatarFlagBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    zIndex: 3,
    elevation: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background.primary,
  },
  flagContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  flagImage: {
    width: 20,
    height: 20,
  },
  recipientInfo: {
    flex: 1,
    minWidth: 0,
  },
  recipientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[1],
    flexWrap: 'nowrap',
    minWidth: 0,
  },
  recipientMetaBadge: {
    flexShrink: 0,
  },
  easnerMarkBadgeImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  recipientName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    flexShrink: 1,
    minWidth: 0,
  },
  recentBadge: {
    backgroundColor: colors.primary.main + '18',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  recentBadgeText: {
    ...textStyles.bodySmall,
    fontFamily: 'Outfit-SemiBold',
    color: colors.primary.main,
    fontSize: 11,
  },
  newRecipientBadge: {
    backgroundColor: colors.neutral[200],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  newRecipientBadgeText: {
    ...textStyles.bodySmall,
    fontFamily: 'Outfit-SemiBold',
    color: colors.text.secondary,
    fontSize: 11,
  },
  recipientBank: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
    marginBottom: spacing[0],
  },
  recipientAccount: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  recipientCurrency: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing[10],
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.frame.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  emptyTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
    textAlign: 'center',
  },
  bottomButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    borderTopWidth: 0.5,
    borderTopColor: colors.frame.border,
    ...Platform.select({
      ios: shadows.md,
      android: {
        elevation: 0,
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
    }),
  },
  addRecipientButton: {
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRecipientButtonText: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontFamily: 'Outfit-SemiBold',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
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
  modalScrollView: {
    flex: 1,
    minHeight: 0,
  },
  modalScrollContent: {
    paddingBottom: spacing[8],
    flexGrow: 1,
  },
  modalContent: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    position: 'relative',
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3000,
    ...Platform.select({
      android: { elevation: 0 },
    }),
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing[4],
    backgroundColor: '#F9F9F9',
    fontFamily: 'Outfit-Regular',
    fontSize: 13,
    minHeight: 48,
    lineHeight: 18,
    textAlignVertical: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  modalButton: {
    flex: 1,
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F9F9F9',
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  saveButton: {
    backgroundColor: colors.primary.main,
  },
  cancelButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  saveButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.inverse,
    fontFamily: 'Outfit-SemiBold',
  },
  disabledButton: {
    opacity: 0.6,
  },
  walletAddressInputWrap: {
    marginBottom: spacing[4],
    position: 'relative',
  },
  walletAddressInput: {
    marginBottom: 0,
    paddingRight: 44,
  },
  walletScanIconButton: {
    position: 'absolute',
    right: spacing[3],
    top: '50%',
    transform: [{ translateY: -16 }],
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    zIndex: 9000,
  },
  scanUiLayer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: spacing[12],
    paddingHorizontal: spacing[6],
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  scanCenterGroup: {
    marginTop: spacing[16],
    alignItems: 'center',
  },
  scanHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  scanTitle: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontFamily: 'Outfit-SemiBold',
  },
  scanCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scanFrame: {
    width: 260,
    height: 260,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'transparent',
  },
  scanHint: {
    ...textStyles.bodySmall,
    color: colors.text.inverse,
    textAlign: 'center',
    marginTop: spacing[3],
  },
  currencySelectorWrapper: {
    marginBottom: spacing[4],
    zIndex: 1000,
  },
  currencySelectorWrapperActive: {
    zIndex: 4000,
  },
  currencySelector: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    backgroundColor: '#F9F9F9',
  },
  currencySelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySelectorText: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginLeft: spacing[2],
    fontFamily: 'Outfit-Regular',
  },
  currencyDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing[1],
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    maxHeight: 260,
    overflow: 'hidden',
    zIndex: 5000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  androidDropdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  androidDropdownContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
  },
  androidDropdownCard: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    overflow: 'hidden',
    elevation: 20,
  },
  currencyDropdownSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    gap: spacing[2],
  },
  currencyDropdownSearchInput: {
    flex: 1,
    ...textStyles.textInputMedium,
    color: colors.text.primary,
    paddingVertical: 0,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        textAlignVertical: 'center',
      },
    }),
  },
  currencyDropdownList: {
    maxHeight: 220,
    ...Platform.select({
      android: { flexGrow: 0 },
    }),
  },
  currencyDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    gap: spacing[2],
  },
  currencyDropdownItemSelected: {
    backgroundColor: colors.primary.main + '10',
  },
  currencyFlag: {
    fontSize: 16,
  },
  currencyInfo: {
    flex: 1,
    marginLeft: spacing[2],
  },
  cryptoIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: spacing[2],
  },
  currencyCode: {
    ...textStyles.bodyMedium,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  currencyName: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing[0],
    fontFamily: 'Outfit-Regular',
  },
  currencySymbol: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  recipientTypeModal: {
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingTop: spacing[2],
  },
  recipientTypeOptions: {
    padding: spacing[5],
    gap: spacing[3],
  },
  recipientTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    gap: spacing[3],
  },
  recipientTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipientTypeContent: {
    flex: 1,
  },
  recipientTypeTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    marginBottom: spacing[1],
  },
  recipientTypeSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  transferTypeContainer: {
    marginBottom: spacing[2],
  },
  transferTypeOptions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  transferTypeOption: {
    flex: 1,
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transferTypeOptionSelected: {
    backgroundColor: colors.primary.main + '15',
    borderColor: colors.primary.main,
    borderWidth: 1.5,
  },
  transferTypeOptionText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-Medium',
  },
  transferTypeOptionTextSelected: {
    color: colors.primary.main,
    fontFamily: 'Outfit-SemiBold',
  },
  errorContainer: {
    backgroundColor: colors.error.background,
    borderColor: colors.error.light,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#F9F9F9',
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
  },
  infoText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  halfInput: {
    flex: 1,
    marginBottom: 0,
  },
})
