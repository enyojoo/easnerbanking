import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { FlashList } from '@shopify/flash-list'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  RefreshControl,
  Modal,
  Animated,
  ActivityIndicator,
  ScrollView,
  Platform,
  Dimensions,
  Keyboard,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useCameraPermissions } from 'expo-camera'
import {
  Plus,
  Search,
  Pencil,
  Hourglass,
  Trash2,
  ArrowLeft,
  CircleX,
  Users,
  X,
  Check,
  ScanLine,
  ChevronUp,
  ChevronDown,
} from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { CachedImage } from '../../components/CachedImage'
import KeyboardSafeContainer from '../../components/KeyboardSafeContainer'
import { useToast } from '../../components/ToastProvider'
import { EasnerAlertSheet } from '../../components/premium'
import { useQueryClient } from '@tanstack/react-query'
import { NavigationProps, Recipient } from '../../types'
import { useRecipientsList, useCurrenciesCatalog } from '../../hooks/queries'
import { useScope } from '../../query/scope'
import { invalidateRecipientsFeed } from '../../query/refresh-user-feeds'
import { recipientService, RecipientData } from '../../lib/recipientService'
import { useAuth } from '../../contexts/AuthContext'
import { analytics } from '../../lib/analytics'
import { useFocusRefresh } from '../../hooks/useFocusRefresh'
import { useSendDestinations } from '../../hooks/useSendDestinations'
import { useFocusEffect } from '@react-navigation/native'
import { getAccountTypeConfigFromCurrency, formatFieldValue } from '../../lib/currencyAccountTypes'
import { validateRequired, validateAccountNumber, validateIBAN } from '../../utils/validators'
import { formatIBAN, formatSortCode, formatRoutingNumber, formatAccountNumber } from '../../utils/formatters'
import { colors, shadows, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { getAllCountryCurrencies, searchCountryCurrencies, CountryCurrency } from '../../lib/countryCurrencyMapping'
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
import { Wallet, Building2, Smartphone, AtSign } from 'lucide-react-native'
import {
  fetchEasenetPublicProfileCached,
  primeEasenetPublicProfileCache,
  warmEasenetPublicProfiles,
} from '../../lib/easenetProfile'
import { EasenetLookupPreview } from '../../components/EasenetLookupPreview'
import { EasenetRecipientHydratedPreview } from '../../components/EasenetRecipientHydratedPreview'
import { RecipientPayoutPreview } from '../../components/RecipientPayoutPreview'
import { ListRowSkeleton } from '../../components/skeletons'
import EmptyState from '../../components/EmptyState'
import RecipientFormDropdownList from '../../components/recipients/RecipientFormDropdownList'
import WalletAddressQrScanner from '../../components/recipients/WalletAddressQrScanner'
import { RecipientBankNameField } from '../../components/recipients/RecipientBankNameField'
import { isEasenetRecipientRecord, resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { CountryFlag } from '../../components/flags/CountryFlag'
import {
  getCountryCodeForCurrency,
  recipientFormNeedsAddress,
  recipientFormNeedsEmail,
} from '@easner/shared'
import { PayoutSchemaExtraFields } from '../../components/recipients/PayoutSchemaExtraFields'
import { UsBankAddressFields } from '../../components/recipients/UsBankAddressFields'
import { useKeyboardScrollPadding } from '../../hooks/useKeyboardScrollPadding'
import { haptics } from '../../lib/haptics'

function RecipientsContent({ navigation }: NavigationProps) {
  const { user, userProfile } = useAuth()
  const { showSuccess, showError, showWarning } = useToast()
  const qc = useQueryClient()
  const { scope } = useScope()
  const recipientsQuery = useRecipientsList()
  const { data: currencies = [] } = useCurrenciesCatalog()
  const [cachedRecipients, setCachedRecipients] = useState<Recipient[]>([])
  const queryRecipients = recipientsQuery.data ?? []
  const recipients = queryRecipients.length > 0 ? queryRecipients : cachedRecipients
  const recipientsLoading = recipientsQuery.isPending && recipients.length === 0
  const insets = useSafeAreaInsets()
  const [uiRecipients, setUiRecipients] = useState<Recipient[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  // New 3-step flow states
  const [showRecipientTypeModal, setShowRecipientTypeModal] = useState(false) // Step 1: Choose type
  const [showCountryCurrencyModal, setShowCountryCurrencyModal] = useState(false) // Step 2: Choose country/currency
  const [showBankAccountForm, setShowBankAccountForm] = useState(false) // Step 3: Bank Account form
  const [selectedRecipientType, setSelectedRecipientType] = useState<'wallet' | 'bank' | 'mobile' | 'easenet' | null>(null)
  const [selectedCountryCurrency, setSelectedCountryCurrency] = useState<CountryCurrency | null>(null)
  const [showCountryDropdown, setShowCountryDropdown] = useState(false) // Inline dropdown like SelectRecipientScreen
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [showWalletAssetDropdown, setShowWalletAssetDropdown] = useState(false)
  const [showWalletNetworkDropdown, setShowWalletNetworkDropdown] = useState(false)
  const [providerSearchTerm, setProviderSearchTerm] = useState('')
  const [walletAssetSearchTerm, setWalletAssetSearchTerm] = useState('')
  const [walletNetworkSearchTerm, setWalletNetworkSearchTerm] = useState('')
  const [showScanModal, setShowScanModal] = useState(false)
  const [showBankDropdown, setShowBankDropdown] = useState(false)
  const [bankSearchTerm, setBankSearchTerm] = useState('')
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [countrySearchTerm, setCountrySearchTerm] = useState('')
  const [transferType, setTransferType] = useState<'ACH' | 'Wire' | null>(null) // For USA
  // Shared form flow state (used by both add and edit)
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false)
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [easenetProfile, setEasenetProfile] = useState<{
    easetag: string
    fullName: string
    avatarUrl: string | null
    accountKind: 'business' | 'personal'
  } | null>(null)
  const [easenetLookupLoading, setEasenetLookupLoading] = useState(false)
  const [easenetLookupError, setEasenetLookupError] = useState<string | null>(null)
  const [androidDropdownKeyboardHeight, setAndroidDropdownKeyboardHeight] = useState(0)
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

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const formScrollRef = useRef<ScrollView>(null)
  const keyboardScrollPadding = useKeyboardScrollPadding()
  const contentAnim = useRef(new Animated.Value(0)).current

  // Run entrance animations
  useCalmParallelEnterWhen(true, headerAnim, contentAnim)
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

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('Recipients')
  }, [])

  // Refresh when screen comes into focus if data is stale
  useFocusRefresh(
    () => {
      void recipientsQuery.refetch()
    },
    5 * 60 * 1000, // 5 minutes
    false
  )

  // Keep local list in sync with context while allowing instant local updates.
  useEffect(() => {
    setUiRecipients(recipients)
  }, [recipients])

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
  
  // Reset form after create/edit form modal closes (for smooth animation)
  useEffect(() => {
    if (!showBankAccountForm && editingRecipient) {
      // Modal just closed, reset form after animation completes
      const timer = setTimeout(() => {
        setEditingRecipient(null)
        resetForm()
      }, 300) // Wait for fade animation (typically 200-300ms)
      return () => clearTimeout(timer)
    }
  }, [showBankAccountForm, editingRecipient])

  const filteredRecipients = uiRecipients.filter((recipient) => {
    const q = searchTerm.toLowerCase()
    if (!q.trim()) return true
    const hay = [
      recipient.full_name,
      recipient.bank_name,
      recipient.payee_easetag ? `@${recipient.payee_easetag}` : '',
      recipient.account_number,
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
    } finally {
      setRefreshing(false)
    }
  }

  const getInitials = (name: string) => {
    const names = name.trim().split(' ').filter(name => name.length > 0)
    if (names.length === 0) return '??'
    if (names.length === 1) return names[0][0].toUpperCase()
    return names.slice(0, 2).map(name => name[0]).join('').toUpperCase()
  }

  const recipientTypeKey =
    selectedRecipientType === 'mobile'
      ? 'mobile_money'
      : selectedRecipientType === 'easenet'
        ? 'bank'
        : (selectedRecipientType || 'bank')
  const filteredCurrencies = useMemo(() => {
    return recipientCatalogFor(recipientTypeKey as RecipientType).filter((currency) => {
      if (countrySearchTerm) {
        const t = countrySearchTerm.toLowerCase()
        return (
          currency.currencyName.toLowerCase().includes(t) ||
          currency.currencyCode.toLowerCase().includes(t) ||
          currency.countryName.toLowerCase().includes(t)
        )
      }
      return true
    })
  }, [recipientTypeKey, countrySearchTerm, recipientCatalogFor, catalogRevision])
  const filteredProviderList = useMemo(
    () =>
      getRecipientProviders(
        newRecipient.currency,
        'mobile_money',
        selectedCountryCurrency?.countryCode,
      ).filter((provider) => provider.toLowerCase().includes(providerSearchTerm.toLowerCase())),
    [newRecipient.currency, selectedCountryCurrency?.countryCode, providerSearchTerm, catalogRevision],
  )
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
    showCountryDropdown ||
    showProviderDropdown ||
    showWalletAssetDropdown ||
    showWalletNetworkDropdown ||
    showBankDropdown
  const closeAllDropdowns = () => {
    setShowCountryDropdown(false)
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
        const createdRecipient = await recipientService.create(userProfile.id, {
          fullName: easenetProfile.fullName,
          accountNumber: tag,
          bankName: `Easetag (@${tag})`,
          currency: 'USD',
          countryCode: 'US',
          payeeEasetag: tag,
          payeeAvatarUrl: easenetProfile.avatarUrl,
          payeeAccountKind: easenetProfile.accountKind,
        })
        setUiRecipients((prev) => [createdRecipient, ...prev.filter((r) => r.id !== createdRecipient.id)])
        if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
        setError('')
        resetForm()
        setShowBankAccountForm(false)
        showSuccess('Recipient added successfully')
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
          ? `Wallet (${newRecipient.network})`
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
      const createdRecipient = await recipientService.create(userProfile.id, {
        fullName: newRecipient.fullName,
        accountNumber: accountNumberForType,
        bankName: bankNameForType,
        currency: newRecipient.currency,
        countryCode: selectedCountryCurrency?.countryCode,
        phoneNumber: selectedRecipientType === 'mobile' ? newRecipient.phoneNumber || undefined : undefined,
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
      setUiRecipients((prev) => [createdRecipient, ...prev.filter((r) => r.id !== createdRecipient.id)])

      // Refresh recipients data
      if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
      setError('')

      // Reset form and close modal
      resetForm()
      setShowBankAccountForm(false)
      showSuccess('Recipient added successfully')
    } catch (error) {
      console.error('Error adding recipient:', error)
      setError('Failed to add recipient')
      showError('Failed to add recipient')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditRecipient = (recipient: Recipient) => {
    setEditingRecipient(recipient)
    const bankNameRaw = String(recipient.bank_name || "")
    const bank = bankNameRaw.toLowerCase()
    const inferredType: 'wallet' | 'bank' | 'mobile' | 'easenet' =
      bank.includes('wallet')
        ? 'wallet'
        : bank.includes('mobile money')
          ? 'mobile'
          : bank.includes('easenet') || bank.includes('easetag')
            ? 'easenet'
            : 'bank'
    setSelectedRecipientType(inferredType)
    if (inferredType === 'easenet') {
      const tag = String(recipient.payee_easetag || recipient.account_number || '')
        .trim()
        .replace(/^@+/, '')
      setEasenetProfile(
        tag
          ? {
              easetag: tag,
              fullName: recipient.full_name,
              avatarUrl: recipient.payee_avatar_url || null,
              accountKind: recipient.payee_account_kind === 'business' ? 'business' : 'personal',
            }
          : null,
      )
      setEasenetLookupError(null)
    } else {
      setEasenetProfile(null)
      setEasenetLookupError(null)
    }
    const walletMatch = bankNameRaw.match(/^Wallet \((.*)\)$/i)
    const walletDescriptor = walletMatch?.[1] || ''
    const [walletAssetFromBank, walletNetworkFromBank] = walletDescriptor.includes('/')
      ? walletDescriptor.split('/')
      : [undefined, walletDescriptor || undefined]
    const mobileMatch = bankNameRaw.match(/^Mobile Money \((.*)\)$/i)
    const mobileInner = mobileMatch?.[1] || ''
    const ccIdx = mobileInner.lastIndexOf('|CC:')
    const providerFromBank = (ccIdx >= 0 ? mobileInner.slice(0, ccIdx) : mobileInner).trim()

    const recipientTypeKey =
      inferredType === 'mobile' ? 'mobile_money' : inferredType === 'easenet' ? 'bank' : inferredType
    const catalogMatch =
      recipientCatalogFor(recipientTypeKey as RecipientType).find(
        (cc) => cc.currencyCode === recipient.currency && (!recipient.country_code || cc.countryCode === recipient.country_code),
      ) ||
      recipientCatalogFor(recipientTypeKey as RecipientType).find((cc) => cc.currencyCode === recipient.currency) ||
      null
    const countryCurrency = catalogMatch
      ? {
          countryCode: catalogMatch.countryCode,
          countryName: catalogMatch.countryName,
          currencyCode: catalogMatch.currencyCode,
          currencyName: catalogMatch.currencyName,
          flagEmoji: '',
        }
      : getAllCountryCurrencies().find((cc) => cc.currencyCode === recipient.currency) || null

    setSelectedCountryCurrency(countryCurrency)
    if (countryCurrency?.countryCode === 'US') {
      setTransferType((recipient.transfer_type as 'ACH' | 'Wire' | null) || null)
    } else {
      setTransferType(null)
    }
    setNewRecipient({
      fullName: recipient.full_name,
      accountNumber: recipient.account_number || '',
      bankName: recipient.bank_name || '',
      currency: (inferredType === 'wallet' ? (walletAssetFromBank || recipient.currency) : recipient.currency) || '',
      routingNumber: recipient.routing_number || '',
      sortCode: recipient.sort_code || '',
      iban: recipient.iban || '',
      swiftBic: recipient.swift_bic || '',
      phoneNumber: inferredType === 'mobile' ? recipient.phone_number || recipient.account_number || '' : '',
      provider: recipient.mobile_provider || (inferredType === 'mobile' ? providerFromBank : '') || '',
      walletAddress: recipient.account_number || '',
      network: recipient.wallet_network || (inferredType === 'wallet' ? walletNetworkFromBank || '' : ''),
      memoTag: recipient.wallet_memo_tag || recipient.swift_bic || '',
      checkingOrSavings: recipient.checking_or_savings || '',
      addressLine1: recipient.address_line1 || '',
      city: recipient.city || '',
      state: recipient.state || '',
      postalCode: recipient.postal_code || '',
      email: recipient.email || '',
      payeeEasetag: (
        recipient.payee_easetag ||
        (inferredType === 'easenet' ? recipient.account_number : '') ||
        ''
      ).replace(/^@+/, ''),
    })
    setShowBankAccountForm(true)
  }

  const handleUpdateRecipient = async () => {
    if (!editingRecipient) return

    if (!isFormValid()) {
      showError('Please fill in all required fields')
      return
    }

    try {
      setIsSubmitting(true)
      setError('')

      if (!user?.id) {
        setError('Not signed in')
        return
      }

      if (selectedRecipientType === 'easenet') {
        if (!easenetProfile) {
          showError('Enter a valid Easetag and wait for the profile to load')
          return
        }
        const tag = easenetProfile.easetag
        const updatedRecipient = await recipientService.update(editingRecipient.id, user.id, {
          fullName: easenetProfile.fullName,
          accountNumber: tag,
          bankName: `Easetag (@${tag})`,
          countryCode: 'US',
          payeeEasetag: tag,
          payeeAvatarUrl: easenetProfile.avatarUrl,
          payeeAccountKind: easenetProfile.accountKind,
        })
        setUiRecipients((prev) => prev.map((r) => (r.id === updatedRecipient.id ? updatedRecipient : r)))
        if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
        setError('')
        setShowBankAccountForm(false)
        showSuccess('Recipient updated successfully')
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
          ? `Wallet (${newRecipient.network})`
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
      const updatedRecipient = await recipientService.update(editingRecipient.id, user.id, {
        fullName: newRecipient.fullName,
        accountNumber: accountNumberForType,
        bankName: bankNameForType,
        phoneNumber: selectedRecipientType === 'mobile' ? newRecipient.phoneNumber : '',
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
        countryCode: selectedCountryCurrency?.countryCode,
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
      setUiRecipients((prev) => prev.map((r) => (r.id === updatedRecipient.id ? updatedRecipient : r)))

      // Refresh recipients data
      if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
      setError('')

      // Close modal first, form reset handled by useEffect after animation
      setShowBankAccountForm(false)
      showSuccess('Recipient updated successfully')
    } catch (error) {
      console.error('Error updating recipient:', error)
      setError('Failed to update recipient')
      showError('Failed to update recipient')
    } finally {
      setIsSubmitting(false)
    }
  }

  const [deleteConfirmation, setDeleteConfirmation] = useState<Recipient | null>(null)

  const handleDeleteRecipient = (recipient: Recipient) => {
    setDeleteConfirmation(recipient)
  }

  const confirmDelete = async () => {
    if (!deleteConfirmation || !user?.id) return
    try {
      setDeletingId(deleteConfirmation.id)
      await recipientService.delete(deleteConfirmation.id, user.id)
      setUiRecipients((prev) => prev.filter((r) => r.id !== deleteConfirmation.id))
      if (scope && user?.id) await invalidateRecipientsFeed(qc, scope, user.id)
      showSuccess('Recipient deleted successfully')
    } catch (error: any) {
      console.error('Error deleting recipient:', error)
      const errorMessage = error.message?.includes('linked to a transaction')
        ? 'Failed to delete - linked to a transaction'
        : 'Failed to delete recipient'
      showError(errorMessage)
    } finally {
      setDeletingId('')
      setDeleteConfirmation(null)
    }
  }

  // Map snake_case field names from config to camelCase form field names
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

  const handleScanPress = async () => {
    const perm = cameraPermission?.granted ? cameraPermission : await requestCameraPermission()
    if (!perm?.granted) {
      showWarning(
        'Camera permission needed. Enable camera access in Settings to scan wallet QR codes.',
      )
      return
    }
    closeAllDropdowns()
    setShowScanModal(true)
  }

  const isFormValid = () => {
    if (selectedRecipientType === 'easenet') {
      return Boolean(easenetProfile && newRecipient.payeeEasetag.trim().length >= 1)
    }
    // For US accounts, transfer type is required
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
    if (selectedCountryCurrency?.countryCode === 'US' && !newRecipient.city.trim()) {
      return false
    }
    if (selectedCountryCurrency?.countryCode === 'US' && !newRecipient.state.trim()) {
      return false
    }
    if (selectedCountryCurrency?.countryCode === 'US' && !newRecipient.postalCode.trim()) {
      return false
    }
    if (!newRecipient.fullName || !newRecipient.currency) return false
    if (selectedRecipientType === 'wallet') return !!newRecipient.network && !!newRecipient.walletAddress
    if (selectedRecipientType === 'mobile') return !!newRecipient.provider && !!newRecipient.phoneNumber

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
    setError('')
    setFieldErrors({})
    // Reset 3-step flow states
    setSelectedRecipientType(null)
    setSelectedCountryCurrency(null)
    setCountrySearchTerm('')
    setShowCountryDropdown(false)
    setShowProviderDropdown(false)
    setShowWalletAssetDropdown(false)
    setShowWalletNetworkDropdown(false)
    setShowScanModal(false)
    setShowCurrencyDropdown(false)
    setProviderSearchTerm('')
    setWalletAssetSearchTerm('')
    setWalletNetworkSearchTerm('')
    setTransferType(null)
    setShowRecipientTypeModal(false)
    setShowBankAccountForm(false)
    setEasenetProfile(null)
    setEasenetLookupError(null)
    setEasenetLookupLoading(false)
  }

  // Validate a single field
  const validateField = (fieldName: string, value: string) => {
    const accountConfig = newRecipient.currency
      ? getAccountTypeConfigFromCurrency(newRecipient.currency)
      : null

    if (!accountConfig) {
      return { isValid: true }
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

    // Check if field is required
    const configFieldName = Object.entries(accountConfig.fieldLabels).find(
      ([_, label]) => mapFieldName(_) === fieldName
    )?.[0]

    if (configFieldName && accountConfig.requiredFields.includes(configFieldName)) {
      const result = validateRequired(value, accountConfig.fieldLabels[configFieldName])
      if (!result.isValid) {
        setFieldErrors(prev => ({ ...prev, [fieldName]: result.error || '' }))
        return result
      }
    }

    // Field-specific validation
    if (fieldName === 'routingNumber' && value) {
      const digits = value.replace(/\D/g, "")
      if (digits.length !== 9) {
        const error = "Routing number must be 9 digits"
        setFieldErrors(prev => ({ ...prev, [fieldName]: error }))
        return { isValid: false, error }
      }
    }

    if (fieldName === 'sortCode' && value) {
      const digits = value.replace(/\D/g, "")
      if (digits.length !== 6) {
        const error = "Sort code must be 6 digits"
        setFieldErrors(prev => ({ ...prev, [fieldName]: error }))
        return { isValid: false, error }
      }
    }

    if (fieldName === 'iban' && value) {
      const result = validateIBAN(value)
      if (!result.isValid) {
        setFieldErrors(prev => ({ ...prev, [fieldName]: result.error || '' }))
        return result
      }
    }

    if (fieldName === 'accountNumber' && value && accountConfig.accountType === 'us') {
      const result = validateAccountNumber(value, 8)
      if (!result.isValid) {
        setFieldErrors(prev => ({ ...prev, [fieldName]: result.error || '' }))
        return result
      }
    }

    // Clear error if validation passes
    setFieldErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[fieldName]
      return newErrors
    })
    return { isValid: true }
  }

  const renderRecipient = ({ item, index }: { item: Recipient; index: number }) => {
    const isEasenet = isEasenetRecipientRecord(item)
    const isLast = index === filteredRecipients.length - 1
    return (
      <Pressable
       android_ripple={ripple.neutral}
        style={[styles.recipientItem, !isLast && styles.recipientItemDivider]} onPress={async () => {
          haptics.tap()
          handleEditRecipient(item)
        }}
      >
        <View style={styles.recipientRow}>
          {isEasenet ? (
            <>
              <EasenetRecipientHydratedPreview recipient={item} variant="row" getInitials={getInitials} />
              <View style={styles.recipientActions}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.actionIcon}
                  onPress={async () => {
                    haptics.tap()
                    handleEditRecipient(item)
                  }}
                  disabled={isSubmitting} >
                  <Pencil size={18} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={[styles.actionIcon, styles.actionIconDelete]}
                  onPress={async () => {
                    haptics.medium()
                    handleDeleteRecipient(item)
                  }}
                  disabled={deletingId === item.id} >
                  {deletingId === item.id ? (
                    <Hourglass size={18} color={colors.error.main} strokeWidth={2} />
                  ) : (
                    <Trash2 size={18} color={colors.error.main} strokeWidth={2} />
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <RecipientPayoutPreview recipient={item} variant="row" getInitials={getInitials} />

              <View style={styles.recipientActions}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.actionIcon}
                  onPress={async () => {
                    haptics.tap()
                    handleEditRecipient(item)
                  }}
                  disabled={isSubmitting} >
                  <Pencil size={18} color={colors.text.primary} strokeWidth={2} />
                </Pressable>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={[styles.actionIcon, styles.actionIconDelete]}
                  onPress={async () => {
                    haptics.medium()
                    handleDeleteRecipient(item)
                  }}
                  disabled={deletingId === item.id} >
                  {deletingId === item.id ? (
                    <Hourglass size={18} color={colors.error.main} strokeWidth={2} />
                  ) : (
                    <Trash2 size={18} color={colors.error.main} strokeWidth={2} />
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Pressable>
    )
  }

  return (
    <ScreenWrapper>
      <KeyboardSafeContainer>
      <View style={styles.container}>
        {/* Premium Header - Matching Send Flow */}
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
            onPress={async () => {
              haptics.tap()
              navigation.goBack()
            }}
            style={styles.backButton} >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
        <Text style={styles.title}>Recipients</Text>
      </View>
        </Animated.View>

        <ScrollView 
          style={styles.scrollView}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Search Bar */}
          <Animated.View 
            style={[
              styles.searchContainer,
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
            <View style={styles.searchWrapper}>
              <Search size={18} color={colors.primary.main} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder="Search recipients..."
                placeholderTextColor={colors.text.secondary}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              {searchTerm.length > 0 && (
                <Pressable android_ripple={ripple.neutral} onPress={() => setSearchTerm('')}>
                  <CircleX size={18} color={colors.primary.main} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          </Animated.View>

          {/* Add New Recipient Button */}
          {/* Recipients List - No Grouping */}
          <Animated.View
            style={[
              styles.recipientsTray,
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
            {recipientsLoading ? (
              <View>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <ListRowSkeleton key={i} variant="recipient" showDivider={i < 5} />
                ))}
              </View>
            ) : filteredRecipients.length > 0 ? (
              <FlashList
                data={filteredRecipients}
                renderItem={renderRecipient}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                estimatedItemSize={112}
                removeClippedSubviews={true}
                drawDistance={400}
              />
            ) : (
              <EmptyState
                icon={Users}
                title={searchTerm.trim() ? 'No matches' : 'No recipients found'}
                message={
                  searchTerm.trim() ? 'Try another search' : 'Add a new recipient to get started'
                }
                action={
                  !searchTerm.trim()
                    ? {
                        label: 'Add recipient',
                        onPress: () => {
                          resetForm()
                          setShowRecipientTypeModal(true)
                        },
                      }
                    : undefined
                }
              />
            )}
          </Animated.View>
        </ScrollView>

        {/* Add new recipient Button - Fixed at bottom */}
        <View style={[styles.bottomButtonContainer, { paddingBottom: insets.bottom + spacing[4] }]}>
          <Pressable
           android_ripple={ripple.neutral}
            style={styles.addRecipientButton}
            onPress={async () => {
              haptics.tap()
              resetForm()
              setShowRecipientTypeModal(true)
            }} >
            <Text style={styles.addRecipientButtonText}>Add new recipient</Text>
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
              {/* Wallet Address Option */}
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.recipientTypeOption}
                onPress={async () => {
                  haptics.tap()
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

              {/* Bank Account Option */}
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.recipientTypeOption}
                onPress={async () => {
                  haptics.tap()
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

              {/* Mobile Wallet Option */}
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.recipientTypeOption}
                onPress={async () => {
                  haptics.tap()
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
                  setShowBankAccountForm(true) // Use same form for now
                }} >
                <View style={styles.recipientTypeIcon}>
                  <Smartphone size={24} color={colors.primary.main} strokeWidth={2} />
                </View>
                <View style={styles.recipientTypeContent}>
                  <Text style={styles.recipientTypeTitle}>Mobile Money</Text>
                  <Text style={styles.recipientTypeSubtitle}>Send cash via mobile money</Text>
                </View>
              </Pressable>

              {/* Easetag (P2P wallet) */}
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.recipientTypeOption}
                onPress={async () => {
                  haptics.tap()
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
          setEditingRecipient(null)
          resetForm()
        }}
      >
        {/* Bank Account Form */}
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <Pressable 
           android_ripple={ripple.neutral} 
            style={StyleSheet.absoluteFill} onPress={() => {
              setShowBankAccountForm(false)
              setEditingRecipient(null)
              resetForm()
            }}
          />
          <View 
            style={[styles.modalContainer, { 
              height: '92%',
              paddingBottom: Math.max(insets.bottom, 20),
            }]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedRecipientType === 'wallet'
                  ? editingRecipient ? 'Edit Wallet Address' : 'Add Wallet Address'
                  : selectedRecipientType === 'mobile'
                    ? editingRecipient ? 'Edit Mobile Money' : 'Add Mobile Money'
                    : selectedRecipientType === 'easenet'
                      ? editingRecipient ? 'Edit Easetag recipient' : 'Add Easetag recipient'
                    : editingRecipient ? 'Edit Bank Account' : 'Add Bank Account'}
              </Text>
              <Pressable
               android_ripple={ripple.neutral}
                onPress={() => {
                  setShowBankAccountForm(false)
                  setEditingRecipient(null)
                  resetForm()
                }}
                style={styles.closeButton}
              >
                <X size={24} color={colors.text.secondary} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView 
              ref={formScrollRef}
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.modalScrollContent,
                { paddingBottom: Math.max(insets.bottom, 20) + keyboardScrollPadding },
              ]}
              nestedScrollEnabled={true}
              // Pause parent form scroll while a dropdown is open so list drags stay inside the dropdown.
              scrollEnabled={!isAnyDropdownOpen}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
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
              
              {/* Country/Currency Selector - Matching SelectRecipientScreen exactly */}
              {selectedRecipientType !== 'wallet' && selectedRecipientType !== 'easenet' && <View style={[styles.currencySelectorWrapper, showCountryDropdown && styles.currencySelectorWrapperActive]}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.currencySelector}
                  onPress={() => {
                    setShowCountryDropdown(!showCountryDropdown)
                    setCountrySearchTerm('')
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
                    {showCountryDropdown ? (
                      <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
                    ) : (
                      <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
                    )}
                  </View>
                </Pressable>
                
                {showCountryDropdown &&
                  renderDropdownContainer(
                    () => {
                      setShowCountryDropdown(false)
                      setCountrySearchTerm('')
                    },
                    <>
                    <View style={styles.currencyDropdownSearch}>
                      <Search size={18} color={colors.neutral[400]} strokeWidth={2} />
                      <TextInput
                        style={styles.currencyDropdownSearchInput}
                        placeholder="Search currencies..."
                        placeholderTextColor={colors.neutral[400]}
                        value={countrySearchTerm}
                        onChangeText={setCountrySearchTerm}
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
                              haptics.tap()
                              const countryToSet: CountryCurrency = {
                                countryCode: item.countryCode,
                                countryName: item.countryName,
                                currencyCode: item.currencyCode,
                                currencyName: item.currencyName,
                                flagEmoji: '',
                              }

                              setSelectedCountryCurrency(countryToSet)
                              const firstProvider =
                                getRecipientProviders(item.currencyCode, 'mobile_money', item.countryCode)[0] || ''
                              setNewRecipient((prev) => ({
                                ...prev,
                                currency: item.currencyCode,
                                provider: selectedRecipientType === 'mobile' ? firstProvider : prev.provider,
                              }))

                              if (countryToSet.countryCode === 'US') {
                                setTransferType(null)
                              } else {
                                setTransferType(null)
                              }

                              setShowCountryDropdown(false)
                              setCountrySearchTerm('')
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
              </View>}

              {/* Show form fields */}
              {(selectedCountryCurrency || selectedRecipientType === 'wallet' || selectedRecipientType === 'easenet') && (
                <>
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
                    {easenetLookupLoading ? <ActivityIndicator size="small" color={colors.primary.main} /> : null}
                  </View>
                  {easenetLookupError ? (
                    <Text style={styles.errorText}>{easenetLookupError}</Text>
                  ) : null}
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
              {selectedRecipientType === 'mobile' && (
                <>
                  <View style={[styles.currencySelectorWrapper, showProviderDropdown && styles.currencySelectorWrapperActive]}>
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={styles.currencySelector}
                      onPress={() => {
                        setShowProviderDropdown(!showProviderDropdown)
                        setShowCountryDropdown(false)
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
                          {filteredProviderList.map((provider) => (
                            <Pressable
                              key={provider}
                              android_ripple={ripple.neutral}
                              style={[
                                styles.currencyDropdownItem,
                                newRecipient.provider === provider && styles.currencyDropdownItemSelected,
                              ]}
                              onPress={async () => {
                                haptics.tap()
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
                                haptics.tap()
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
                                haptics.tap()
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
                  return null
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
                              haptics.tap()
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
                              haptics.tap()
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
                        style={[styles.modalInput, fieldErrors.fullName && styles.modalInputError]}
                        value={newRecipient.fullName}
                        onChangeText={(text) => {
                          setNewRecipient(prev => ({ ...prev, fullName: text }))
                          validateField('fullName', text)
                        }}
                        onBlur={() => validateField('fullName', newRecipient.fullName)}
                        placeholder="Account name"
                        placeholderTextColor={colors.text.secondary}
                        autoCapitalize="words"
                        returnKeyType="done"
                        onSubmitEditing={() => Keyboard.dismiss()}
                        editable={!isSubmitting}
                      />
                      {fieldErrors.fullName && (
                        <Text style={styles.errorText}>{fieldErrors.fullName}</Text>
                      )}
                    </View>

                    {/* Bank Name */}
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
                      onChange={(bank) => {
                        setNewRecipient((prev) => ({ ...prev, bankName: bank }))
                        validateField('bankName', bank)
                      }}
                      placeholder={`${accountConfig.fieldLabels.bank_name} *`}
                      disabled={isSubmitting}
                      hasError={Boolean(fieldErrors.bankName)}
                      errorMessage={fieldErrors.bankName}
                      showDropdown={showBankDropdown}
                      onToggleDropdown={() => {
                        setShowBankDropdown(!showBankDropdown)
                        setShowCountryDropdown(false)
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
                      onBlurValidate={(v) => validateField('bankName', v)}
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
                                  haptics.tap()
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
                                  haptics.tap()
                                }} >
                                <Text style={[styles.transferTypeOptionText, newRecipient.checkingOrSavings === 'savings' && styles.transferTypeOptionTextSelected]}>
                                  Savings
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : null}
                        <UsBankAddressFields
                          scrollRef={formScrollRef}
                          inputStyle={styles.modalInput}
                          rowStyle={styles.twoColumnRow}
                          halfInputStyle={styles.halfInput}
                          values={{
                            addressLine1: newRecipient.addressLine1,
                            city: newRecipient.city,
                            state: newRecipient.state,
                            postalCode: newRecipient.postalCode,
                          }}
                          onChange={(patch) =>
                            setNewRecipient((prev) => ({ ...prev, ...patch }))
                          }
                          isSubmitting={isSubmitting}
                        />
                        <View>
                          <TextInput
                            style={[styles.modalInput, fieldErrors.routingNumber && styles.modalInputError]}
                            value={newRecipient.routingNumber}
                            onChangeText={(text) => {
                              const formatted = formatRoutingNumber(text)
                              setNewRecipient(prev => ({ ...prev, routingNumber: formatted }))
                              validateField('routingNumber', formatted)
                            }}
                            onBlur={() => validateField('routingNumber', newRecipient.routingNumber)}
                            placeholder={`${accountConfig.fieldLabels.routing_number} *`}
                            placeholderTextColor={colors.text.secondary}
                            keyboardType="number-pad"
                            maxLength={9}
                            autoComplete="off"
                            autoCorrect={false}
                            textContentType="none"
                            editable={!isSubmitting}
                          />
                          {fieldErrors.routingNumber && (
                            <Text style={styles.errorText}>{fieldErrors.routingNumber}</Text>
                          )}
                        </View>
                        <View>
                          <TextInput
                            style={[styles.modalInput, fieldErrors.accountNumber && styles.modalInputError]}
                            value={newRecipient.accountNumber}
                            onChangeText={(text) => {
                              const formatted = formatAccountNumber(text)
                              setNewRecipient(prev => ({ ...prev, accountNumber: formatted }))
                              validateField('accountNumber', formatted)
                            }}
                            onBlur={() => validateField('accountNumber', newRecipient.accountNumber)}
                            placeholder={`${accountConfig.fieldLabels.account_number} *`}
                            placeholderTextColor={colors.text.secondary}
                            keyboardType="number-pad"
                            autoComplete="off"
                            autoCorrect={false}
                            textContentType="none"
                            editable={!isSubmitting}
                          />
                          {fieldErrors.accountNumber && (
                            <Text style={styles.errorText}>{fieldErrors.accountNumber}</Text>
                          )}
                        </View>
                      </>
                    )}

                    {/* UK Account Fields */}
                    {accountConfig.accountType === "uk" && (
                      <>
                        <View style={styles.twoColumnRow}>
                          <View style={styles.halfInput}>
                            <TextInput
                              style={[styles.modalInput, fieldErrors.sortCode && styles.modalInputError]}
                              value={newRecipient.sortCode}
                              onChangeText={(text) => {
                                const formatted = formatSortCode(text)
                                setNewRecipient(prev => ({ ...prev, sortCode: formatted }))
                                validateField('sortCode', formatted.replace(/-/g, ''))
                              }}
                              onBlur={() => validateField('sortCode', newRecipient.sortCode.replace(/-/g, ''))}
                              placeholder={`${accountConfig.fieldLabels.sort_code} *`}
                              placeholderTextColor={colors.text.secondary}
                              keyboardType="number-pad"
                              maxLength={8}
                              autoComplete="off"
                              autoCorrect={false}
                              textContentType="none"
                              editable={!isSubmitting}
                            />
                            {fieldErrors.sortCode && (
                              <Text style={styles.errorText}>{fieldErrors.sortCode}</Text>
                            )}
                          </View>
                          <View style={styles.halfInput}>
                            <TextInput
                              style={[styles.modalInput, fieldErrors.accountNumber && styles.modalInputError]}
                              value={newRecipient.accountNumber}
                              onChangeText={(text) => {
                                const formatted = formatAccountNumber(text)
                                setNewRecipient(prev => ({ ...prev, accountNumber: formatted }))
                                validateField('accountNumber', formatted)
                              }}
                              onBlur={() => validateField('accountNumber', newRecipient.accountNumber)}
                              placeholder={`${accountConfig.fieldLabels.account_number} *`}
                              placeholderTextColor={colors.text.secondary}
                              keyboardType="number-pad"
                              autoComplete="off"
                              autoCorrect={false}
                              textContentType="none"
                              editable={!isSubmitting}
                            />
                            {fieldErrors.accountNumber && (
                              <Text style={styles.errorText}>{fieldErrors.accountNumber}</Text>
                            )}
                          </View>
                        </View>
                        <View>
                          <TextInput
                            style={[styles.modalInput, fieldErrors.iban && styles.modalInputError]}
                            value={newRecipient.iban}
                            onChangeText={(text) => {
                              const formatted = formatIBAN(text)
                              setNewRecipient(prev => ({ ...prev, iban: formatted }))
                              validateField('iban', formatted)
                            }}
                            onBlur={() => validateField('iban', newRecipient.iban)}
                            placeholder={accountConfig.fieldLabels.iban}
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="characters"
                            returnKeyType="done"
                            onSubmitEditing={() => Keyboard.dismiss()}
                            editable={!isSubmitting}
                          />
                          {fieldErrors.iban && (
                            <Text style={styles.errorText}>{fieldErrors.iban}</Text>
                          )}
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
                            style={[styles.modalInput, fieldErrors.iban && styles.modalInputError]}
                            value={newRecipient.iban}
                            onChangeText={(text) => {
                              const formatted = formatIBAN(text)
                              setNewRecipient(prev => ({ ...prev, iban: formatted }))
                              validateField('iban', formatted)
                            }}
                            onBlur={() => validateField('iban', newRecipient.iban)}
                            placeholder={`${accountConfig.fieldLabels.iban} *`}
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="characters"
                            editable={!isSubmitting}
                          />
                          {fieldErrors.iban && (
                            <Text style={styles.errorText}>{fieldErrors.iban}</Text>
                          )}
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

                    {/* Generic Account Fields (for African countries, etc.) */}
                    {accountConfig.accountType === "generic" && (
                      <View>
                        <TextInput
                          style={[styles.modalInput, fieldErrors.accountNumber && styles.modalInputError]}
                          value={newRecipient.accountNumber}
                          onChangeText={(text) => {
                            const formatted = formatAccountNumber(text)
                            setNewRecipient(prev => ({ ...prev, accountNumber: formatted }))
                            validateField('accountNumber', formatted)
                          }}
                          onBlur={() => validateField('accountNumber', newRecipient.accountNumber)}
                          placeholder={`${accountConfig.fieldLabels.account_number} *`}
                          placeholderTextColor={colors.text.secondary}
                          keyboardType="number-pad"
                          autoComplete="off"
                          autoCorrect={false}
                          textContentType="none"
                          editable={!isSubmitting}
                        />
                        {fieldErrors.accountNumber && (
                          <Text style={styles.errorText}>{fieldErrors.accountNumber}</Text>
                        )}
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
                </>
              )}

              <View style={styles.modalButtons}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowBankAccountForm(false)
                    setEditingRecipient(null)
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
                  onPress={editingRecipient ? handleUpdateRecipient : handleAddRecipient}
                  disabled={isSubmitting || !isFormValid()}
                >
                  <Text style={styles.saveButtonText}>
                    {isSubmitting ? (editingRecipient ? 'Saving...' : 'Adding...') : (editingRecipient ? 'Save changes' : 'Add')}
                  </Text>
                </Pressable>
              </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <WalletAddressQrScanner
        visible={showScanModal}
        onClose={() => setShowScanModal(false)}
        onScan={(address) => setNewRecipient((prev) => ({ ...prev, walletAddress: address }))}
      />

      <EasnerAlertSheet
        visible={deleteConfirmation !== null}
        onDismiss={() => {
          if (!deletingId) setDeleteConfirmation(null)
        }}
        title="Delete Recipient"
        message={`Are you sure you want to delete ${deleteConfirmation?.full_name ?? 'this recipient'}? This action cannot be undone.`}
        primaryLabel="Delete"
        onPrimary={() => void confirmDelete()}
        secondaryLabel="Cancel"
        onSecondary={() => {
          if (!deletingId) setDeleteConfirmation(null)
        }}
        primaryDestructive
        primaryLoading={Boolean(deletingId)}
      />
      </KeyboardSafeContainer>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
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
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  content: {
    flex: 1,
    padding: spacing[5],
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
    ...shadows.md,
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
  /** White SectionCard frame — flat rows with hairline dividers (More-screen parity). */
  recipientsTray: {
    ...surfaceFrameStyle(colors),
    marginHorizontal: spacing[5],
    marginBottom: spacing[4],
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
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
  easnerMarkBadgeImage: {
    width: 20,
    height: 13,
    borderRadius: 2,
  },
  flagImage: {
    width: 20,
    height: 13,
  },
  recipientInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing[2],
  },
  recipientName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[1],
    minWidth: 0,
  },
  recipientBank: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    marginBottom: 0,
  },
  recipientAccount: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },
  recipientCurrency: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },
  recipientActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIconDelete: {
    backgroundColor: colors.error.background,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[10],
    gap: spacing[2],
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  emptySubtext: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
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
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    marginBottom: spacing[2],
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
  modalInputError: {
    borderColor: colors.error.main,
    borderWidth: 1.5,
  },
  easenetHandleRowMargin: {
    marginBottom: spacing[2],
  },
  easenetAtPrefix: {
    ...textStyles.textInputMedium,
    color: colors.primary.main,
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
    marginTop: -spacing[2],
    marginBottom: spacing[2],
    marginLeft: spacing[1],
    fontFamily: fontFamily.regular,
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
  // Currency Selector Styles
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
  cryptoIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: spacing[2],
  },
  // Currency Picker Modal Styles
  currencyModalSearchContainer: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  currencyModalSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[100],
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    gap: spacing[2],
  },
  currencyModalSearchInput: {
    flex: 1,
    paddingVertical: spacing[3],
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  currencyInfo: {
    flex: 1,
    marginLeft: spacing[3],
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
  },
  disabledButton: {
    opacity: 0.6,
  },
  disabledSelector: {
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
  infoBox: {
    backgroundColor: colors.neutral[50],
    borderRadius: borderRadius.md,
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
  // New 3-step flow styles
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
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[1],
  },
  recipientTypeSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  countryCurrencyModal: {
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingTop: spacing[2],
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
  },
  backButtonModal: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countrySearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginHorizontal: spacing[5],
    marginBottom: spacing[3],
    gap: spacing[2],
  },
  countrySearchInput: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.regular,
  },
  countryList: {
    flex: 1,
    paddingHorizontal: spacing[5],
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.frame.border,
    gap: spacing[3],
  },
  countryFlag: {
    fontSize: 32,
  },
  countryInfo: {
    flex: 1,
  },
  countryName: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    marginBottom: spacing[1],
  },
  countryCurrency: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  countryDisplay: {
    marginBottom: spacing[4],
  },
  countryDisplayLabel: {
    ...textStyles.labelMedium,
    color: colors.text.secondary,
    marginBottom: spacing[2],
    fontFamily: fontFamily.medium,
  },
  countryDisplayValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
    padding: spacing[4],
  },
  countryDisplayText: {
    ...textStyles.bodyMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
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
  transferTypeOptionSelected: {
    backgroundColor: colors.primary.main + '15',
    borderColor: colors.primary.main,
    borderWidth: 1,
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
})

// Export RecipientsScreen directly (authentication handled at navigator level)
export default function RecipientsScreen(props: NavigationProps) {
  return <RecipientsContent {...props} />
}
