import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  ScrollView,
  TextInput,
  Modal,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Keyboard,
  ActivityIndicator,
} from 'react-native'
import { FlashList } from '@shopify/flash-list'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import {
  ArrowLeft,
  AtSign,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleX,
  ScanLine,
  Search,
  Smartphone,
  Users,
  Wallet,
  X,
} from 'lucide-react-native'
import {
  fetchEasenetPublicProfileCached,
  primeEasenetPublicProfileCache,
  warmEasenetPublicProfiles,
} from '../../lib/easenetProfile'
import { EasenetLookupPreview } from '../../components/EasenetLookupPreview'
import { EasenetRecipientHydratedPreview } from '../../components/EasenetRecipientHydratedPreview'
import { RecipientPayoutPreview } from '../../components/RecipientPayoutPreview'
import { ListRowSkeleton } from '../../components/skeletons'
import { isEasenetRecipientRecord, resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'
import {
  mergeLastSentMaps,
  sortRecipientsForSendHub,
  filterRecipientsBySearch,
} from '../../lib/recentSendRecipients'
import { buildDraftEasenetRecipient, isDraftEasenetRecipient } from '../../lib/draftEasenetRecipient'
import { NavigationProps, Recipient } from '../../types'
import { colors, shadows, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import ScreenWrapper from '../../components/ScreenWrapper'
import { CachedImage } from '../../components/CachedImage'
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
  recipientFormNeedsAddress,
  recipientFormNeedsEmail,
} from '@easner/shared'
import { PayoutSchemaExtraFields } from '../../components/recipients/PayoutSchemaExtraFields'
import {
  buildRecipientCatalogForType,
  getPayoutFieldsSchemaForCorridor,
  getRecipientProviders,
  getWalletAssets,
  getWalletNetworksForAsset,
  type RecipientType,
} from '../../lib/recipientCatalog'
import { getNetworkIconUrl, getTokenIconUrl } from '../../lib/cryptoIcons'
import { loadRecipientsListCache, saveRecipientsListCache } from '../../lib/recipientsListCache'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { CountryFlag } from '../../components/flags/CountryFlag'
import RecipientFormDropdownList from '../../components/recipients/RecipientFormDropdownList'
import { RecipientBankNameField } from '../../components/recipients/RecipientBankNameField'
import { useToast } from '../../components/ToastProvider'
import { useSendDestinations } from '../../hooks/useSendDestinations'
import { useFocusEffect } from '@react-navigation/native'

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ')
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function SelectRecentRecipientScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { user, userProfile } = useAuth()
  const { showError, showWarning } = useToast()
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
  const [cachedRecipients, setCachedRecipients] = useState<Recipient[]>([])
  const queryRecipients = recipientsQuery.data ?? []
  const recipients = queryRecipients.length > 0 ? queryRecipients : cachedRecipients
  const recipientsLoading = recipientsQuery.isPending && recipients.length === 0
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
  const [showBankDropdown, setShowBankDropdown] = useState(false)
  const [bankSearchTerm, setBankSearchTerm] = useState('')
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
  const {
    bankCorridors,
    mobileCorridors,
    cryptoDestinations,
    catalogRevision,
    refresh: refreshCatalog,
  } = useSendDestinations()

  useFocusEffect(
    useCallback(() => {
      void refreshCatalog()
    }, [refreshCatalog]),
  )

  const recipientCatalogFor = useCallback(
    (type: RecipientType) =>
      buildRecipientCatalogForType(type, {
        bank: bankCorridors,
        mobile: mobileCorridors,
        crypto: cryptoDestinations,
      }),
    [bankCorridors, mobileCorridors, cryptoDestinations],
  )

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
    city: '',
    state: '',
    postalCode: '',
    email: '',
    payeeEasetag: '',
  })

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  useEffect(() => {
    const uid = userProfile?.id || user?.id
    if (!uid) return
    let mounted = true
    void loadRecipientsListCache(uid).then((rows) => {
      if (!mounted || rows.length === 0) return
      setCachedRecipients(rows)
    })
    return () => {
      mounted = false
    }
  }, [userProfile?.id, user?.id])

  useEffect(() => {
    const uid = userProfile?.id || user?.id
    if (!uid || queryRecipients.length === 0) return
    void saveRecipientsListCache(uid, queryRecipients)
  }, [queryRecipients, userProfile?.id, user?.id])

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

  const { sorted: hubSorted } = useMemo(
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
      city: '',
      state: '',
      postalCode: '',
      email: '',
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
      showWarning(
        'Camera permission needed. Enable camera access in Settings to scan wallet QR codes.',
      )
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
    if (
      selectedCountryCurrency?.countryCode === 'US' &&
      transferType !== 'Wire' &&
      !newRecipient.checkingOrSavings
    ) {
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

    const bankEnum =
      selectedCountryCurrency && selectedRecipientType === 'bank'
        ? getPayoutFieldsSchemaForCorridor({
            countryCode: selectedCountryCurrency.countryCode,
            currencyCode: selectedCountryCurrency.currencyCode,
            rail: 'bank_transfer',
          })?.bank_enum ?? []
        : []
    if (
      bankEnum.length > 0 &&
      newRecipient.bankName.trim() &&
      !bankEnum.includes(newRecipient.bankName.trim())
    ) {
      return false
    }

    const schemaHints =
      selectedCountryCurrency && selectedRecipientType === 'bank'
        ? getPayoutFieldsSchemaForCorridor({
            countryCode: selectedCountryCurrency.countryCode,
            currencyCode: selectedCountryCurrency.currencyCode,
            rail: 'bank_transfer',
          })
        : null
    if (recipientFormNeedsEmail(schemaHints) && !newRecipient.email.trim()) return false
    if (
      recipientFormNeedsAddress({ hints: schemaHints, currencyCode: newRecipient.currency }) &&
      selectedCountryCurrency?.countryCode !== 'US'
    ) {
      if (!newRecipient.addressLine1.trim()) return false
      if (!newRecipient.city.trim()) return false
      if (!newRecipient.state.trim()) return false
      if (!newRecipient.postalCode.trim()) return false
    }

    return true
  }

  const handleAddRecipient = async () => {
    if (!userProfile?.id) {
      showError('User not authenticated')
      return
    }

    if (!isFormValid()) {
      showError('Please fill in all required fields')
      return
    }

    try {
      setIsSubmitting(true)
      setError('')

      if (selectedRecipientType === 'easenet') {
        if (!easenetProfile) {
          showError('Enter a valid Easetag and wait for the profile to load')
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

      const bankSchemaHints =
        selectedCountryCurrency && selectedRecipientType === 'bank'
          ? getPayoutFieldsSchemaForCorridor({
              countryCode: selectedCountryCurrency.countryCode,
              currencyCode: selectedCountryCurrency.currencyCode,
              rail: 'bank_transfer',
            })
          : null
      const needsAddr =
        selectedRecipientType === 'bank' &&
        recipientFormNeedsAddress({ hints: bankSchemaHints, currencyCode: newRecipient.currency })
      const newRecipientData = await recipientService.create(userProfile.id, {
        fullName: newRecipient.fullName,
        accountNumber: accountNumberForType,
        bankName: bankNameForType,
        currency: newRecipient.currency,
        countryCode: selectedCountryCurrency?.countryCode,
        phoneNumber: selectedRecipientType === 'mobile' ? newRecipient.phoneNumber : undefined,
        email:
          selectedRecipientType === 'bank' && recipientFormNeedsEmail(bankSchemaHints)
            ? newRecipient.email.trim() || undefined
            : undefined,
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
        addressLine1:
          selectedCountryCurrency?.countryCode === 'US' || needsAddr
            ? newRecipient.addressLine1 || undefined
            : undefined,
        city:
          selectedCountryCurrency?.countryCode === 'US' || needsAddr
            ? newRecipient.city || undefined
            : undefined,
        state:
          selectedCountryCurrency?.countryCode === 'US' || needsAddr
            ? newRecipient.state || undefined
            : undefined,
        postalCode:
          selectedCountryCurrency?.countryCode === 'US' || needsAddr
            ? newRecipient.postalCode || undefined
            : undefined,
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
      showError('Failed to add recipient')
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
  const filteredCurrencies = useMemo(() => {
    return recipientCatalogFor(recipientTypeKey as RecipientType).filter((currency) => {
      if (currencySearchTerm) {
        return (
          currency.currencyName.toLowerCase().includes(currencySearchTerm.toLowerCase()) ||
          currency.currencyCode.toLowerCase().includes(currencySearchTerm.toLowerCase()) ||
          currency.countryName.toLowerCase().includes(currencySearchTerm.toLowerCase())
        )
      }
      return true
    })
  }, [recipientTypeKey, currencySearchTerm, recipientCatalogFor, catalogRevision])
  const walletAssetOptions = useMemo(
    () =>
      cryptoDestinations.length
        ? [...new Set(cryptoDestinations.map((d) => d.asset_code))]
        : getWalletAssets(),
    [cryptoDestinations, catalogRevision],
  )
  const walletNetworkOptions = useMemo(
    () => getWalletNetworksForAsset(newRecipient.currency),
    [newRecipient.currency, cryptoDestinations, catalogRevision],
  )
  const filteredWalletAssets = useMemo(
    () =>
      walletAssetOptions.filter((asset) =>
        asset.toLowerCase().includes(walletAssetSearchTerm.toLowerCase()),
      ),
    [walletAssetOptions, walletAssetSearchTerm],
  )
  const filteredWalletNetworks = useMemo(
    () =>
      walletNetworkOptions.filter((network) =>
        network.toLowerCase().includes(walletNetworkSearchTerm.toLowerCase()),
      ),
    [walletNetworkOptions, walletNetworkSearchTerm],
  )
  const selectedCatalogEntry = useMemo(
    () =>
      recipientCatalogFor(recipientTypeKey as RecipientType).find(
        (item) =>
          item.currencyCode === newRecipient.currency &&
          item.countryCode === selectedCountryCurrency?.countryCode,
      ) ||
      recipientCatalogFor(recipientTypeKey as RecipientType).find(
        (item) => item.currencyCode === newRecipient.currency,
      ),
    [
      recipientTypeKey,
      newRecipient.currency,
      selectedCountryCurrency?.countryCode,
      recipientCatalogFor,
      catalogRevision,
    ],
  )
  const isAnyDropdownOpen =
    showCurrencyDropdown ||
    showProviderDropdown ||
    showWalletAssetDropdown ||
    showWalletNetworkDropdown ||
    showBankDropdown
  const closeAllDropdowns = () => {
    setShowCurrencyDropdown(false)
    setShowProviderDropdown(false)
    setShowWalletAssetDropdown(false)
    setShowWalletNetworkDropdown(false)
    setShowBankDropdown(false)
    setBankSearchTerm('')
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

  const renderRecipient = ({ item, index }: { item: Recipient; index: number }) => {
    const isDraftEasenet = isDraftEasenetRecipient(item.id)
    const isEasenet = isEasenetRecipientRecord(item)
    const isLast = index === sendHubFlatListData.length - 1
    return (
      <Pressable
       android_ripple={ripple.neutral}
        style={[styles.recipientItem, !isLast && styles.recipientItemDivider]}
        onPress={() => handleSelectRecipient(item)} >
        <View style={styles.recipientRow}>
          <View style={[styles.recipientPreviewSlot, isDraftEasenet && styles.recipientPreviewSlotWithBadge]}>
            {isEasenet ? (
              <EasenetRecipientHydratedPreview recipient={item} variant="row" getInitials={getInitials} />
            ) : (
              <RecipientPayoutPreview recipient={item} variant="row" getInitials={getInitials} />
            )}
            {isDraftEasenet ? (
              <View style={[styles.newRecipientBadge, styles.newRecipientBadgeCorner]} pointerEvents="none">
                <Text style={styles.newRecipientBadgeText}>New</Text>
              </View>
            ) : null}
          </View>
          <ChevronRight size={20} color={colors.text.secondary} strokeWidth={2} />
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
          <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
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
              <CircleX size={18} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
        {searchTerm.trim().startsWith('@') && hubSearchError && !hubSearchLoading && !hubVirtualRecipient ? (
          <Text style={styles.searchErrorText}>{hubSearchError}</Text>
        ) : null}
      </Animated.View>
    </>
  )

  const screenBody = (
    <>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: insets.bottom + 100,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {listHeader}
          <Animated.View
            style={[
              styles.recipientsTray,
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
            {recipientsLoading && recipients.length === 0 ? (
              <View>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <ListRowSkeleton key={i} variant="recipient" showDivider={i < 5} />
                ))}
              </View>
            ) : sendHubFlatListData.length > 0 ? (
              <FlashList
                data={sendHubFlatListData}
                renderItem={renderRecipient}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                estimatedItemSize={112}
                removeClippedSubviews
                drawDistance={400}
              />
            ) : (
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
                <Users size={48} color={colors.text.secondary} strokeWidth={1.5} />
                <Text style={styles.emptyText}>
                  {searchTerm.trim() ? 'No matches' : 'No recipients found'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {searchTerm.trim()
                    ? 'Try another search'
                    : 'Add a new recipient to get started'}
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        </ScrollView>

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
                <X size={24} color={colors.text.secondary} strokeWidth={2} />
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
                <X size={24} color={colors.text.secondary} strokeWidth={2} />
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
                  {showCurrencyDropdown ? (
                    <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
                  ) : (
                    <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
                  )}
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
                    <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
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
                            <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
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
                        {showProviderDropdown ? (
                          <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
                        ) : (
                          <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
                        )}
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
                          <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
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
                                  <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
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
                        {getTokenIconUrl(newRecipient.currency) ? <CachedImage uri={getTokenIconUrl(newRecipient.currency)!} style={styles.cryptoIcon} contentFit="cover" /> : null}
                        <Text style={styles.currencySelectorText}>
                          {newRecipient.currency || 'Select asset'}
                        </Text>
                        {showWalletAssetDropdown ? (
                          <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
                        ) : (
                          <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
                        )}
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
                          <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
                          <TextInput
                            style={styles.currencyDropdownSearchInput}
                            placeholder="Search asset..."
                            placeholderTextColor={colors.neutral[400]}
                            value={walletAssetSearchTerm}
                            onChangeText={setWalletAssetSearchTerm}
                          />
                        </View>
                        <RecipientFormDropdownList>
                          {filteredWalletAssets.map((asset) => (
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
                                  <CachedImage uri={getTokenIconUrl(asset)!} style={styles.cryptoIcon} contentFit="cover" />
                                ) : null}
                                <View style={styles.currencyInfo}>
                                  <Text style={styles.currencyCode}>{asset}</Text>
                                </View>
                                {newRecipient.currency === asset ? (
                                  <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
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
                        {getNetworkIconUrl(newRecipient.network) ? <CachedImage uri={getNetworkIconUrl(newRecipient.network)!} style={styles.cryptoIcon} contentFit="cover" /> : null}
                        <Text style={styles.currencySelectorText}>
                          {newRecipient.network || 'Select network'}
                        </Text>
                        {showWalletNetworkDropdown ? (
                          <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
                        ) : (
                          <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
                        )}
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
                          <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
                          <TextInput
                            style={styles.currencyDropdownSearchInput}
                            placeholder="Search network..."
                            placeholderTextColor={colors.neutral[400]}
                            value={walletNetworkSearchTerm}
                            onChangeText={setWalletNetworkSearchTerm}
                          />
                        </View>
                        <RecipientFormDropdownList>
                          {filteredWalletNetworks.map((network) => (
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
                                  <CachedImage uri={getNetworkIconUrl(network)!} style={styles.cryptoIcon} contentFit="cover" />
                                ) : null}
                                <View style={styles.currencyInfo}>
                                  <Text style={styles.currencyCode}>{network}</Text>
                                </View>
                                {newRecipient.network === network ? (
                                  <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
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
                  <ScanLine size={18} color={colors.primary.main} strokeWidth={2} />
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

                    <RecipientBankNameField
                      banks={
                        selectedCountryCurrency
                          ? getPayoutFieldsSchemaForCorridor({
                              countryCode: selectedCountryCurrency.countryCode,
                              currencyCode: selectedCountryCurrency.currencyCode,
                              rail: 'bank_transfer',
                            })?.bank_enum ?? []
                          : []
                      }
                      value={newRecipient.bankName}
                      onChange={(bank) =>
                        setNewRecipient((prev) => ({ ...prev, bankName: bank }))
                      }
                      placeholder={`${accountConfig.fieldLabels.bank_name} *`}
                      disabled={isSubmitting}
                      showDropdown={showBankDropdown}
                      onToggleDropdown={() => {
                        setShowBankDropdown(!showBankDropdown)
                        setShowCurrencyDropdown(false)
                        setShowProviderDropdown(false)
                        setShowWalletAssetDropdown(false)
                        setShowWalletNetworkDropdown(false)
                      }}
                      searchTerm={bankSearchTerm}
                      onSearchTermChange={setBankSearchTerm}
                      onCloseDropdown={() => {
                        setShowBankDropdown(false)
                        setBankSearchTerm('')
                      }}
                      renderDropdownContainer={renderDropdownContainer}
                    />

                    {/* US Account Fields */}
                    {accountConfig.accountType === "us" && (
                      <>
                        {transferType !== 'Wire' ? (
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
                        ) : null}
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

                    {selectedRecipientType === 'bank' && selectedCountryCurrency ? (
                      <PayoutSchemaExtraFields
                        hints={getPayoutFieldsSchemaForCorridor({
                          countryCode: selectedCountryCurrency.countryCode,
                          currencyCode: selectedCountryCurrency.currencyCode,
                          rail: 'bank_transfer',
                        })}
                        currencyCode={newRecipient.currency}
                        countryCode={selectedCountryCurrency.countryCode}
                        values={{
                          email: newRecipient.email,
                          addressLine1: newRecipient.addressLine1,
                          city: newRecipient.city,
                          state: newRecipient.state,
                          postalCode: newRecipient.postalCode,
                        }}
                        onChange={(patch) => setNewRecipient((prev) => ({ ...prev, ...patch }))}
                        isSubmitting={isSubmitting}
                      />
                    ) : null}
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
                      <X size={22} color={colors.text.inverse} strokeWidth={2} />
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
  searchContainer: {
    paddingHorizontal: spacing[5],
    marginBottom: spacing[4],
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    paddingHorizontal: spacing[4],
    ...Platform.select({
      ios: { paddingVertical: spacing[3] },
      android: { paddingVertical: spacing[2], minHeight: 44 },
    }),
    gap: spacing[2],
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
    fontFamily: fontFamily.regular,
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
    ...surfaceFrameStyle(colors),
    height: 52,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginBottom: spacing[4],
    gap: spacing[3],
  },
  selectRecipientIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.semantic.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.frame.border,
  },
  selectRecipientText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
  },
  sectionTitleContainer: {
    paddingHorizontal: spacing[5],
    marginBottom: spacing[3],
    marginTop: spacing[2],
  },
  sectionTitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
  },
  /** White SectionCard frame — flat rows with hairline dividers (More-screen parity). */
  recipientsTray: {
    ...surfaceFrameStyle(colors),
    marginHorizontal: spacing[5],
    marginBottom: spacing[4],
    overflow: 'hidden',
  },
  recipientItem: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[5],
    minHeight: 80,
    justifyContent: 'center',
  },
  recipientItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  recipientPreviewSlot: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  recipientPreviewSlotWithBadge: {
    paddingRight: 44,
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
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
  },
  avatarFlagBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    zIndex: 3,
    elevation: 3,
    width: 20,
    height: 13,
    borderRadius: 2,
    backgroundColor: colors.background.primary,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.background.primary,
  },
  flagContainer: {
    width: 20,
    height: 13,
    borderRadius: 2,
    overflow: 'hidden',
  },
  flagImage: {
    width: 20,
    height: 13,
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
  easnerMarkBadgeImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  recipientName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    flexShrink: 1,
    minWidth: 0,
  },
  newRecipientBadge: {
    backgroundColor: colors.primary.main + '18',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  /** Draft Easenet row — top-trailing corner of the preview block (clear of the chevron). */
  newRecipientBadgeCorner: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 2,
    elevation: 2,
  },
  newRecipientBadgeText: {
    ...textStyles.bodySmall,
    fontFamily: fontFamily.semibold,
    color: colors.primary.main,
    fontSize: 11,
  },
  recipientBank: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    marginBottom: spacing[0],
  },
  recipientAccount: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  recipientCurrency: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[10],
    gap: spacing[2],
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  emptySubtext: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
    borderRadius: borderRadius.full,
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRecipientButtonText: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
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
        shadowColor: colors.neutral.black,
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
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing[4],
    backgroundColor: colors.frame.background,
    fontFamily: fontFamily.regular,
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
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  cancelButton: {
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
  },
  saveButton: {
    backgroundColor: colors.primary.main,
  },
  cancelButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  saveButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
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
    fontFamily: fontFamily.semibold,
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
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    padding: spacing[3],
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
    fontFamily: fontFamily.regular,
  },
  currencyDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing[1],
    borderWidth: 1,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    maxHeight: 260,
    overflow: 'hidden',
    zIndex: 5000,
    ...Platform.select({
      ios: {
        shadowColor: colors.neutral.black,
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
    borderColor: colors.frame.border,
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
    fontFamily: fontFamily.semibold,
  },
  currencyName: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing[0],
    fontFamily: fontFamily.regular,
  },
  currencySymbol: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
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
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
    padding: spacing[4],
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
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[1],
  },
  recipientTypeSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
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
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bankEnumValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
  },
  bankEnumPlaceholder: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  bankEnumRow: {
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.frame.border,
  },
  transferTypeOptionSelected: {
    backgroundColor: colors.primary.main + '15',
    borderColor: colors.primary.main,
    borderWidth: 1.5,
  },
  transferTypeOptionText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
  },
  transferTypeOptionTextSelected: {
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
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
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.md }),
    padding: spacing[3],
    marginBottom: spacing[4],
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
