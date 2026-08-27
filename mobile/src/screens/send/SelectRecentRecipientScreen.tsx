import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  TextInput,
  Platform,
  Keyboard,
  ActivityIndicator,
} from 'react-native'
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { FlashList } from '@shopify/flash-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  AtSign,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleX,
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
import EmptyState from '../../components/EmptyState'
import { isEasenetRecipientRecord, resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'
import {
  mergeLastSentMaps,
  sortRecipientsForSendHub,
  filterRecipientsBySearch,
} from '../../lib/recentSendRecipients'
import { buildDraftEasenetRecipient, isDraftEasenetRecipient } from '../../lib/draftEasenetRecipient'
import { buildDraftRecipient } from '../../lib/draftRecipient'
import type { RecipientData } from '../../lib/recipientService'
import { NavigationProps, Recipient } from '../../types'
import {
  colors,
  shadows,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  textStyles,
  borderRadius,
  spacing,
  motion,
  fontFamily,
  searchFieldWrapperStyle,
  searchFieldInputStyle,
  dropdownSearchRowStyle,
  dropdownSearchInputStyle,
  compactFormInputStyle,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useFixedFooterPadding, useScrollPaddingAboveFooter } from '../../hooks/useScrollBottomPadding'
import { WebAwareModal } from '../../components/WebAwareModal'
import { CachedImage } from '../../components/CachedImage'
import KeyboardSafeContainer from '../../components/KeyboardSafeContainer'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrenciesCatalog, useRecipientsList, useTransactionsList, mapLedgerRowToTransaction, TRANSACTIONS_LEDGER_PAGE_SIZE } from '../../hooks/queries'
import { prefetchSendRatesForRecipient } from '../../lib/warmSendRateCaches'
import { useScope } from '../../query/scope'
import { invalidateRecipientsFeed } from '../../query/refresh-user-feeds'
import { recipientService } from '../../lib/recipientService'
import { getAccountTypeConfigFromCurrency } from '../../lib/currencyAccountTypes'
import { formatIBAN, formatSortCode, formatRoutingNumber, formatAccountNumber } from '../../utils/formatters'
import { CountryCurrency } from '../../lib/countryCurrencyMapping'
import {
  isBankNameAllowedForCorridor,
  isMomoProviderAllowedForCorridor,
  mapCadRoutingToGridMetadata,
  normalizeRecipientYcMetadata,
  recipientFormShowsAddress,
  recipientFormNeedsBankCode,
  recipientFormNeedsEmail,
  recipientFormNeedsPhone,
  resolvePrimaryPayoutProvider,
  resolveYcCorridorSchema,
  usBankPaymentMethodsForProvider,
  validateGridRecipientForCorridor,
  validateYcRecipientForCorridor,
  ycAccountNumberLabel,
  type UsBankTransferType,
} from '@easner/shared'
import { validateRecipientHolderAddress } from '@easner/shared/postal-address-form'
import { PayoutSchemaExtraFields } from '../../components/recipients/PayoutSchemaExtraFields'
import { CorridorRecipientExtraFields, formPatchFromCorridorExtras } from '../../components/recipients/YcRecipientExtraFields'
import { RecipientOperationalAddressFields } from '../../components/recipients/RecipientOperationalAddressFields'
import { RecipientFormDropdownHost, RegisterRecipientDropdownSheet } from '../../components/recipients/RecipientFormDropdownHost'
import {
  buildRecipientCatalogForType,
  getCorridorRecipientOptions,
  getPayoutFieldsSchemaForCorridor,
  getRecipientProviders,
  getWalletAssets,
  getWalletNetworksForAsset,
  type RecipientType,
} from '../../lib/recipientCatalog'
import { getNetworkIconUrl, getTokenIconUrl } from '../../lib/cryptoIcons'
import { MobileMoneyProviderIcon } from '@easner/shared'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { CountryFlag } from '../../components/flags/CountryFlag'
import RecipientFormDropdownList from '../../components/recipients/RecipientFormDropdownList'
import { WalletAddressField } from '../../components/recipients/WalletAddressField'
import { EmbeddedWalletAddressQrScanner } from '../../components/recipients/WalletAddressQrScanner'
import {
  inferWalletAddressFromApi,
  resolveInferredWalletAssetNetwork,
} from '../../lib/walletAddressInference'
import { RecipientBankNameField } from '../../components/recipients/RecipientBankNameField'
import { useToast } from '../../components/ToastProvider'
import { useSendDestinations } from '../../hooks/useSendDestinations'
import { useFocusRefresh } from '../../hooks/useFocusRefresh'
import { useFocusEffect } from '@react-navigation/native'
import { haptics } from '../../lib/haptics'
import { analytics } from '../../lib/analytics'
import { exitSendFlowFromHub } from '../../navigation/stackBackNavigation'

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ')
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function SelectRecentRecipientScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const listBottomPadding = useScrollPaddingAboveFooter()
  const footerPadding = useFixedFooterPadding(spacing[4])
  const { user, userProfile } = useAuth()
  const { showError } = useToast()
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
  const txHubQuery = useTransactionsList({}, TRANSACTIONS_LEDGER_PAGE_SIZE)
  const queryRecipients = recipientsQuery.data ?? []
  const recipients = queryRecipients
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
  const [showSubdivisionDropdown, setShowSubdivisionDropdown] = useState(false)
  const [subdivisionSearchTerm, setSubdivisionSearchTerm] = useState('')
  const [selectedRecipientType, setSelectedRecipientType] = useState<'wallet' | 'bank' | 'mobile' | 'easenet' | null>(null)
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false)
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [showWalletAssetDropdown, setShowWalletAssetDropdown] = useState(false)
  const [showWalletNetworkDropdown, setShowWalletNetworkDropdown] = useState(false)
  const [currencySearchTerm, setCurrencySearchTerm] = useState('')
  const [providerSearchTerm, setProviderSearchTerm] = useState('')
  const [walletAssetSearchTerm, setWalletAssetSearchTerm] = useState('')
  const [walletNetworkSearchTerm, setWalletNetworkSearchTerm] = useState('')
  const [showWalletAddressScanner, setShowWalletAddressScanner] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selectedCountryCurrency, setSelectedCountryCurrency] = useState<CountryCurrency | null>(null)
  const [transferType, setTransferType] = useState<UsBankTransferType | null>(null)
  const [easenetProfile, setEasenetProfile] = useState<{
    easetag: string
    fullName: string
    avatarUrl: string | null
    accountKind: 'business' | 'personal'
  } | null>(null)
  const [easenetLookupLoading, setEasenetLookupLoading] = useState(false)
  const [easenetLookupError, setEasenetLookupError] = useState<string | null>(null)

  /** Hub search (@mode) live lookup ? separate from add-recipient modal. */
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

  const applyWalletAddressInference = useCallback((text: string) => {
    void inferWalletAddressFromApi(text)
      .then(({ best, candidates }) => {
        if (!best) return
        setNewRecipient((prev) => {
          const { asset, network } = resolveInferredWalletAssetNetwork({
            candidates,
            best,
            previousAsset: prev.currency,
            previousNetwork: prev.network,
          })
          return { ...prev, currency: asset, network }
        })
      })
      .catch(() => {})
  }, [])

  const scannedWalletAddress = (route.params as { scannedWalletAddress?: string } | undefined)
    ?.scannedWalletAddress

  useEffect(() => {
    if (!scannedWalletAddress) return
    setNewRecipient((prev) => ({ ...prev, walletAddress: scannedWalletAddress }))
    applyWalletAddressInference(scannedWalletAddress)
    navigation.setParams({ scannedWalletAddress: undefined } as never)
  }, [scannedWalletAddress, navigation, applyWalletAddressInference])

  const recipientCatalogFor = useCallback(
    (type: RecipientType) =>
      buildRecipientCatalogForType(type, {
        bank: bankCorridors,
        mobile: mobileCorridors,
        crypto: cryptoDestinations,
      }),
    [bankCorridors, mobileCorridors, cryptoDestinations],
  )

  const selectedBankCorridor = useMemo(() => {
    if (!selectedCountryCurrency || selectedRecipientType !== 'bank') return null
    return (
      bankCorridors.find(
        (c) =>
          c.country_code === selectedCountryCurrency.countryCode &&
          c.currency_code === selectedCountryCurrency.currencyCode,
      ) ?? null
    )
  }, [bankCorridors, selectedCountryCurrency, selectedRecipientType])

  const payoutProvider = resolvePrimaryPayoutProvider(selectedBankCorridor?.provider_routing)
  const usTransferMethods = useMemo(() => {
    if (selectedRecipientType !== 'bank' || selectedCountryCurrency?.countryCode !== 'US') return []
    if (!selectedBankCorridor) return usBankPaymentMethodsForProvider('noah').slice(0, 1)
    return usBankPaymentMethodsForProvider(payoutProvider)
  }, [selectedRecipientType, selectedCountryCurrency?.countryCode, selectedBankCorridor, payoutProvider])

  useEffect(() => {
    if (selectedRecipientType !== 'bank' || selectedCountryCurrency?.countryCode !== 'US') return
    const allowed = usTransferMethods.map((method) => method.value)
    if (allowed.length === 0) return
    if (!transferType || !allowed.includes(transferType)) {
      setTransferType(allowed[0])
    }
  }, [selectedRecipientType, selectedCountryCurrency?.countryCode, usTransferMethods, transferType])

  const corridorRecipientOptions = useMemo(() => {
    if (!selectedCountryCurrency) {
      return { bankOptions: [] as string[], momoOptions: [] as string[], momoCandidates: [], extraFields: [], accountNumberLabel: undefined as string | undefined, accountNumberHint: undefined as string | undefined }
    }
    const rail = selectedRecipientType === 'mobile' ? 'mobile_money' : 'bank_transfer'
    return getCorridorRecipientOptions({
      countryCode: selectedCountryCurrency.countryCode,
      currencyCode: selectedCountryCurrency.currencyCode,
      rail,
    })
  }, [selectedCountryCurrency, selectedRecipientType, catalogRevision])

  const ycCorridorSchema = useMemo(() => {
    if (!selectedCountryCurrency) return null
    return resolveYcCorridorSchema({
      countryCode: selectedCountryCurrency.countryCode,
      currencyCode: selectedCountryCurrency.currencyCode,
      fieldsSchema: selectedBankCorridor?.fields_schema,
    })
  }, [selectedCountryCurrency, selectedBankCorridor])

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
    checkingOrSavings: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    email: '',
    payeeEasetag: '',
    ycPixKeyType: '',
    ycTaxId: '',
    ycCuit: '',
    ycIdentificationType: '',
    ycIdentificationNumber: '',
    ycAccountType: '',
    ycIfsc: '',
    ycBankCode: '',
    ycBranchCode: '',
    ycGridRegion: '',
  })

  const buildFormYcMetadata = useCallback(() => {
    const extras = normalizeRecipientYcMetadata({
      pix_key_type: newRecipient.ycPixKeyType,
      tax_id: newRecipient.ycTaxId,
      cuit: newRecipient.ycCuit,
      identification_type: newRecipient.ycIdentificationType,
      identification_number: newRecipient.ycIdentificationNumber,
      account_type: newRecipient.ycAccountType,
      ifsc: newRecipient.ycIfsc,
      bank_code: newRecipient.ycBankCode,
      branch_code: newRecipient.ycBranchCode,
      grid_region: newRecipient.ycGridRegion,
    })
    if (
      selectedCountryCurrency?.countryCode === 'CA' &&
      String(newRecipient.currency || '').toUpperCase() === 'CAD'
    ) {
      return mapCadRoutingToGridMetadata({
        routingNumber: newRecipient.routingNumber,
        sortCode: newRecipient.sortCode,
        metadata: extras,
      })
    }
    return extras
  }, [
    newRecipient.ycPixKeyType,
    newRecipient.ycTaxId,
    newRecipient.ycCuit,
    newRecipient.ycIdentificationType,
    newRecipient.ycIdentificationNumber,
    newRecipient.ycAccountType,
    newRecipient.ycIfsc,
    newRecipient.ycBankCode,
    newRecipient.ycBranchCode,
    newRecipient.ycGridRegion,
    newRecipient.routingNumber,
    newRecipient.sortCode,
    newRecipient.currency,
    selectedCountryCurrency?.countryCode,
  ])

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current
  const formScrollRef = useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null)

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  // Match RecipientsScreen: refetch list when hub gains focus (first visit or stale > 5m).
  useFocusRefresh(
    () => {
      void recipientsQuery.refetch()
      void txHubQuery.refetch()
    },
    5 * 60 * 1000,
    false,
  )

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
      userId: userProfile.id,
      accountKind: hubSearchEasenet.accountKind,
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

  const handleSelectRecipient = async (recipient: Recipient) => {
    haptics.tap()
    analytics.trackRecipientSelected({ recipientId: recipient.id, country: recipient.country_code })
    prefetchSendRatesForRecipient(qc, recipient)
    // Use navigate (not push) so re-entering amount after "Change recipient" does not stack duplicate
    // SendAmount screens ? back should be hub once, then dashboard.
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
    haptics.tap()
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
      checkingOrSavings: '',
      addressLine1: '',
      city: '',
      state: '',
      postalCode: '',
      email: '',
      payeeEasetag: '',
      ycPixKeyType: '',
      ycTaxId: '',
      ycCuit: '',
      ycIdentificationType: '',
      ycIdentificationNumber: '',
      ycAccountType: '',
      ycIfsc: '',
      ycBankCode: '',
      ycBranchCode: '',
      ycGridRegion: '',
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
    setShowBankDropdown(false)
    setBankSearchTerm('')
    setShowSubdivisionDropdown(false)
    setSubdivisionSearchTerm('')
    setProviderSearchTerm('')
    setWalletAssetSearchTerm('')
    setWalletNetworkSearchTerm('')
    setShowWalletAddressScanner(false)
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

  const handleWalletScanPress = () => {
    Keyboard.dismiss()
    closeAllDropdowns()
    setShowWalletAddressScanner(true)
  }

  const bankSchemaHints =
    selectedCountryCurrency && selectedRecipientType === 'bank'
      ? getPayoutFieldsSchemaForCorridor({
          countryCode: selectedCountryCurrency.countryCode,
          currencyCode: selectedCountryCurrency.currencyCode,
          rail: 'bank_transfer',
        })
      : null
  const showsHolderAddress =
    selectedRecipientType === 'bank' &&
    recipientFormShowsAddress({
      hints: bankSchemaHints,
      currencyCode: newRecipient.currency,
      countryCode: selectedCountryCurrency?.countryCode,
      payoutProvider,
    })

  const isFormValid = () => {
    if (selectedRecipientType === 'easenet') {
      return Boolean(easenetProfile && newRecipient.payeeEasetag.trim().length >= 1)
    }
    if (!newRecipient.fullName || !newRecipient.currency) return false

    if (selectedRecipientType === 'wallet') return !!newRecipient.network && !!newRecipient.walletAddress
    if (selectedRecipientType === 'mobile') return !!newRecipient.provider && !!newRecipient.phoneNumber

    if (
      selectedCountryCurrency?.countryCode === 'US' &&
      usTransferMethods.length > 0 &&
      !transferType
    ) {
      return false
    }
    if (showsHolderAddress && selectedCountryCurrency) {
      const addressResult = validateRecipientHolderAddress(selectedCountryCurrency.countryCode, {
        line1: newRecipient.addressLine1,
        city: newRecipient.city,
        state: newRecipient.state,
        postalCode: newRecipient.postalCode,
        countryCode: selectedCountryCurrency.countryCode,
      })
      if (!addressResult.valid) return false
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

    const bankEnum = corridorRecipientOptions.bankOptions
    if (
      bankEnum.length > 0 &&
      newRecipient.bankName.trim() &&
      !isBankNameAllowedForCorridor(newRecipient.bankName.trim(), corridorRecipientOptions)
    ) {
      return false
    }

    if (
      selectedRecipientType === 'mobile' &&
      corridorRecipientOptions.momoOptions.length > 0 &&
      newRecipient.provider.trim() &&
      !isMomoProviderAllowedForCorridor(newRecipient.provider.trim(), corridorRecipientOptions)
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
    if (recipientFormNeedsPhone(schemaHints) && !newRecipient.phoneNumber.trim()) return false
    if (recipientFormNeedsBankCode(schemaHints)) {
      const swift = newRecipient.swiftBic.trim()
      if (!swift || !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/i.test(swift)) return false
    }

    if (
      selectedRecipientType === 'bank' &&
      selectedCountryCurrency &&
      ycCorridorSchema?.status === 'ready'
    ) {
      const ycCheck = validateYcRecipientForCorridor({
        countryCode: selectedCountryCurrency.countryCode,
        currencyCode: selectedCountryCurrency.currencyCode,
        fieldsSchema: selectedBankCorridor?.fields_schema,
        row: {
          country_code: selectedCountryCurrency.countryCode,
          currency: newRecipient.currency,
          full_name: newRecipient.fullName,
          account_number: newRecipient.accountNumber,
          bank_name: newRecipient.bankName,
          phone_number: newRecipient.phoneNumber,
          metadata: buildFormYcMetadata(),
        },
      })
      if (!ycCheck.ok) return false
    }

    if (
      selectedRecipientType === 'bank' &&
      selectedCountryCurrency &&
      (payoutProvider === 'grid' || corridorRecipientOptions.extraFields.length > 0)
    ) {
      const gridCheck = validateGridRecipientForCorridor({
        countryCode: selectedCountryCurrency.countryCode,
        currencyCode: selectedCountryCurrency.currencyCode,
        fieldsSchema: selectedBankCorridor?.fields_schema,
        row: {
          country_code: selectedCountryCurrency.countryCode,
          currency: newRecipient.currency,
          full_name: newRecipient.fullName,
          account_number: newRecipient.accountNumber,
          bank_name: newRecipient.bankName,
          phone_number: newRecipient.phoneNumber,
          metadata: buildFormYcMetadata(),
        },
      })
      if (!gridCheck.ok) return false
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
        const persistPayload: RecipientData = {
          fullName: easenetProfile.fullName,
          accountNumber: tag,
          bankName: `Easetag (@${tag})`,
          currency: 'USD',
          countryCode: 'US',
          payeeAvatarUrl: easenetProfile.avatarUrl,
          payeeAccountKind: easenetProfile.accountKind,
        }
        const draftRecipient = buildDraftRecipient(userProfile.id, persistPayload, 'easenet')
        setError('')
        resetForm()
        setShowBankAccountForm(false)
        setShowRecipientTypeModal(false)
        navigation.navigate('SendAmount' as never, {
          recipient: draftRecipient,
          draftRecipientPersist: persistPayload,
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

      const persistPayload: RecipientData = {
        fullName: newRecipient.fullName,
        accountNumber: accountNumberForType,
        bankName: bankNameForType,
        currency: newRecipient.currency,
        countryCode: selectedCountryCurrency?.countryCode,
        phoneNumber:
          selectedRecipientType === 'mobile' ||
          (selectedRecipientType === 'bank' && recipientFormNeedsPhone(bankSchemaHints))
            ? newRecipient.phoneNumber.trim() || undefined
            : undefined,
        email:
          selectedRecipientType === 'bank' && recipientFormNeedsEmail(bankSchemaHints)
            ? newRecipient.email.trim() || undefined
            : undefined,
        mobileProvider: selectedRecipientType === 'mobile' ? newRecipient.provider : undefined,
        walletNetwork: selectedRecipientType === 'wallet' ? newRecipient.network : undefined,
        routingNumber: newRecipient.routingNumber || undefined,
        sortCode: newRecipient.sortCode || undefined,
        iban: newRecipient.iban || undefined,
        swiftBic: newRecipient.swiftBic || undefined,
        transferType: selectedCountryCurrency?.countryCode === 'US' ? transferType || undefined : undefined,
        checkingOrSavings:
          selectedCountryCurrency?.countryCode === 'US' &&
          (newRecipient.checkingOrSavings === 'checking' || newRecipient.checkingOrSavings === 'savings')
            ? newRecipient.checkingOrSavings
            : undefined,
        addressLine1: showsHolderAddress ? newRecipient.addressLine1 || undefined : undefined,
        city: showsHolderAddress ? newRecipient.city || undefined : undefined,
        state: showsHolderAddress ? newRecipient.state || undefined : undefined,
        postalCode: showsHolderAddress ? newRecipient.postalCode || undefined : undefined,
        metadata: selectedRecipientType === 'bank' ? buildFormYcMetadata() : undefined,
      }
      const draftKind =
        selectedRecipientType === 'wallet'
          ? 'wallet'
          : selectedRecipientType === 'mobile'
            ? 'mobile'
            : 'bank'
      const draftRecipient = buildDraftRecipient(userProfile.id, persistPayload, draftKind)

      setError('')
      resetForm()
      setShowBankAccountForm(false)
      setShowRecipientTypeModal(false)

      navigation.navigate('SendAmount' as never, {
        recipient: draftRecipient,
        draftRecipientPersist: persistPayload,
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
    showBankDropdown ||
    showSubdivisionDropdown
  const closeAllDropdowns = () => {
    setShowCurrencyDropdown(false)
    setShowProviderDropdown(false)
    setShowWalletAssetDropdown(false)
    setShowWalletNetworkDropdown(false)
    setShowBankDropdown(false)
    setBankSearchTerm('')
    setShowSubdivisionDropdown(false)
    setSubdivisionSearchTerm('')
  }
  const renderRecipient = ({ item, index }: { item: Recipient; index: number }) => {
    const isDraftEasenet = isDraftEasenetRecipient(item.id)
    const isEasenet = isEasenetRecipientRecord(item)
    const isLast = index === sendHubFlatListData.length - 1
    return (
      <Pressable
       android_ripple={ripple.neutral}
        style={[styles.recipientItem, !isLast && styles.recipientItemDivider]}
        onPressIn={() => {
          // Start the rate fetch the instant the finger touches the row ? same DB rows as quote.
          prefetchSendRatesForRecipient(qc, item)
        }}
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

  const screenBody = (
    <>
      <View style={styles.container}>
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
              haptics.tap()
              exitSendFlowFromHub(navigation)
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

        <Animated.View
          style={[
            styles.recipientsTray,
            styles.listTray,
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
          ) : (
            <FlashList
              data={sendHubFlatListData}
              renderItem={renderRecipient}
              keyExtractor={(item) => item.id}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              estimatedItemSize={112}
              removeClippedSubviews
              drawDistance={400}
              contentContainerStyle={{ paddingBottom: listBottomPadding }}
              ListEmptyComponent={
                <EmptyState
                  icon={Users}
                  title={searchTerm.trim() ? 'No matches' : 'No recipients found'}
                  message={
                    searchTerm.trim()
                      ? 'Try another search'
                      : 'Add a new recipient to get started'
                  }
                  action={
                    !searchTerm.trim()
                      ? { label: 'Add recipient', onPress: handleAddNewRecipient }
                      : undefined
                  }
                />
              }
            />
          )}
        </Animated.View>

        {/* Add a recipient Button - Fixed at bottom */}
        <View style={[styles.bottomButtonContainer, { paddingBottom: footerPadding }]}>
          <Pressable
           android_ripple={ripple.neutral}
            style={styles.addRecipientButton}
            onPress={handleAddNewRecipient} >
            <Text style={styles.addRecipientButtonText}>Add a recipient</Text>
          </Pressable>
        </View>
      </View>

      {/* Step 1: Recipient Type Selection Modal */}
      <WebAwareModal
        visible={showRecipientTypeModal}
        keyboardAvoiding
        compact
        onRequestClose={() => {
          setShowRecipientTypeModal(false)
          resetForm()
        }}
        nativePanelStyle={[
          styles.recipientTypeModal,
          { paddingBottom: footerPadding },
        ]}
      >
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
      </WebAwareModal>

      {/* Step 2: Bank Account Form Modal */}
      <WebAwareModal
        visible={showBankAccountForm}
        keyboardAvoiding
        onRequestClose={() => {
          closeAllDropdowns()
          setShowBankAccountForm(false)
          resetForm()
        }}
        nativePanelStyle={{
          height: '92%',
          paddingBottom: footerPadding,
        }}
        webPanelStyle={{
          maxWidth: 560,
          maxHeight: '90%',
        }}
      >
          <RecipientFormDropdownHost>
          <View style={styles.modalFormBody}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {showWalletAddressScanner && selectedRecipientType === 'wallet'
                  ? 'Scan wallet address'
                  : selectedRecipientType === 'wallet'
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
                  if (showWalletAddressScanner) {
                    setShowWalletAddressScanner(false)
                    return
                  }
                  setShowBankAccountForm(false)
                  resetForm()
                }}
                style={styles.closeButton}
              >
                <X size={24} color={colors.text.secondary} strokeWidth={2} />
              </Pressable>
            </View>

            {showWalletAddressScanner && selectedRecipientType === 'wallet' ? (
              <EmbeddedWalletAddressQrScanner
                visible
                showHeader={false}
                onClose={() => setShowWalletAddressScanner(false)}
                onScan={(address) => {
                  setNewRecipient((prev) => ({ ...prev, walletAddress: address }))
                  applyWalletAddressInference(address)
                  setShowWalletAddressScanner(false)
                }}
              />
            ) : (
            <KeyboardAwareScrollView
              ref={formScrollRef}
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.modalScrollContent,
                { paddingBottom: footerPadding },
              ]}
              nestedScrollEnabled={true}
              scrollEnabled={!isAnyDropdownOpen}
              keyboardShouldPersistTaps="handled"
              bottomOffset={insets.bottom + spacing[3]}
            >
              <View style={styles.modalContent}>
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
                  setShowSubdivisionDropdown(false)
                  setShowBankDropdown(false)
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
              
              <RegisterRecipientDropdownSheet
                visible={showCurrencyDropdown}
                onClose={() => {
                  setShowCurrencyDropdown(false)
                  setCurrencySearchTerm('')
                }}
              >
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
                            haptics.tap()
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
              </RegisterRecipientDropdownSheet>
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
                        {newRecipient.provider ? (
                          <>
                            <MobileMoneyProviderIcon provider={newRecipient.provider} size={22} />
                            <Text style={styles.currencySelectorText}>{newRecipient.provider}</Text>
                          </>
                        ) : (
                          <Text style={styles.currencySelectorText}>Select provider</Text>
                        )}
                        {showProviderDropdown ? (
                          <ChevronUp size={16} color={colors.brand.slate} strokeWidth={2} />
                        ) : (
                          <ChevronDown size={16} color={colors.brand.slate} strokeWidth={2} />
                        )}
                      </View>
                    </Pressable>
                    <RegisterRecipientDropdownSheet
                      visible={showProviderDropdown}
                      onClose={() => {
                        setShowProviderDropdown(false)
                        setProviderSearchTerm('')
                      }}
                    >
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
                                  haptics.tap()
                                  setNewRecipient((prev) => ({ ...prev, provider }))
                                  setShowProviderDropdown(false)
                                  setProviderSearchTerm('')
                                }}
                              >
                                <MobileMoneyProviderIcon provider={provider} size={22} />
                                <View style={styles.currencyInfo}>
                                  <Text style={styles.currencyCode}>{provider}</Text>
                                </View>
                                {newRecipient.provider === provider ? (
                                  <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
                                ) : null}
                              </Pressable>
                            ))}
                        </RecipientFormDropdownList>
                    </RegisterRecipientDropdownSheet>
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
                  <View style={styles.walletAddressInputWrap}>
                    <TextInput
                      style={[styles.modalInput, styles.walletAddressInput, styles.walletNicknameInput]}
                      value={newRecipient.fullName}
                      onChangeText={(text) => setNewRecipient(prev => ({ ...prev, fullName: text }))}
                      placeholder="Address nickname"
                      placeholderTextColor={colors.text.secondary}
                      editable={!isSubmitting}
                    />
                  </View>
                  <WalletAddressField
                    value={newRecipient.walletAddress}
                    onChangeText={(text) => {
                      setNewRecipient((prev) => ({ ...prev, walletAddress: text }))
                      applyWalletAddressInference(text)
                    }}
                    onScanPress={handleWalletScanPress}
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
                    <RegisterRecipientDropdownSheet
                      visible={showWalletAssetDropdown}
                      onClose={() => {
                        setShowWalletAssetDropdown(false)
                        setWalletAssetSearchTerm('')
                      }}
                    >
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
                    </RegisterRecipientDropdownSheet>
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
                    <RegisterRecipientDropdownSheet
                      visible={showWalletNetworkDropdown}
                      onClose={() => {
                        setShowWalletNetworkDropdown(false)
                        setWalletNetworkSearchTerm('')
                      }}
                    >
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
                    </RegisterRecipientDropdownSheet>
                  </View>
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
                    {accountConfig.accountType === "us" && usTransferMethods.length > 0 && (
                      <View style={styles.transferTypeContainer}>
                        <View style={styles.transferTypeOptions}>
                          {usTransferMethods.map((method) => (
                            <Pressable
                              key={method.value}
                              android_ripple={ripple.neutral}
                              style={[
                                styles.transferTypeOption,
                                transferType === method.value && styles.transferTypeOptionSelected,
                              ]}
                              onPress={() => {
                                setTransferType(method.value)
                                haptics.tap()
                              }}
                            >
                              <Text
                                style={[
                                  styles.transferTypeOptionText,
                                  transferType === method.value && styles.transferTypeOptionTextSelected,
                                ]}
                              >
                                {method.label}
                              </Text>
                              {method.speedLabel ? (
                                <Text
                                  style={[
                                    styles.transferTypeOptionSpeed,
                                    transferType === method.value && styles.transferTypeOptionSpeedSelected,
                                  ]}
                                >
                                  {method.speedLabel}
                                </Text>
                              ) : null}
                            </Pressable>
                          ))}
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
                        selectedCountryCurrency ? corridorRecipientOptions.bankOptions : []
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
                        setShowSubdivisionDropdown(false)
                      }}
                      searchTerm={bankSearchTerm}
                      onSearchTermChange={setBankSearchTerm}
                      onCloseDropdown={() => {
                        setShowBankDropdown(false)
                        setBankSearchTerm('')
                      }}
                    />

                    {/* US Account Fields */}
                    {accountConfig.accountType === "us" ? (
                      <>
                        {showsHolderAddress && selectedCountryCurrency ? (
                          <RecipientOperationalAddressFields
                            countryCode={selectedCountryCurrency.countryCode}
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
                            showSubdivisionDropdown={showSubdivisionDropdown}
                            onToggleSubdivisionDropdown={() => {
                              setShowSubdivisionDropdown(!showSubdivisionDropdown)
                              setShowBankDropdown(false)
                              setShowCurrencyDropdown(false)
                              setShowProviderDropdown(false)
                              setShowWalletAssetDropdown(false)
                              setShowWalletNetworkDropdown(false)
                            }}
                            subdivisionSearchTerm={subdivisionSearchTerm}
                            onSubdivisionSearchTermChange={setSubdivisionSearchTerm}
                            onCloseSubdivisionDropdown={() => {
                              setShowSubdivisionDropdown(false)
                              setSubdivisionSearchTerm('')
                            }}
                          />
                        ) : null}
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
                    ) : null}

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
                        {(() => {
                          const extraFields = corridorRecipientOptions.extraFields.length
                            ? corridorRecipientOptions.extraFields
                            : ycCorridorSchema?.extra_fields
                          const isPix = (extraFields ?? []).some((field) => field.key === 'pix_key_type')
                          const pixType = newRecipient.ycPixKeyType
                          const accountKeyboard = !isPix
                            ? 'number-pad'
                            : pixType === 'EMAIL'
                              ? 'email-address'
                              : pixType === 'PHONE' || pixType === 'CPF' || pixType === 'CNPJ'
                                ? 'number-pad'
                                : 'default'
                          const accountLabel =
                            (corridorRecipientOptions.accountNumberLabel &&
                            corridorRecipientOptions.accountNumberLabel !== 'Account number'
                              ? corridorRecipientOptions.accountNumberLabel
                              : null) ||
                            ycAccountNumberLabel(ycCorridorSchema) ||
                            corridorRecipientOptions.accountNumberLabel ||
                            accountConfig.fieldLabels.account_number
                          const accountNumberField = (
                            <View>
                              <Text style={styles.fieldLabel}>{accountLabel} *</Text>
                              <TextInput
                                style={[styles.modalInput, styles.modalInputFlush]}
                                value={newRecipient.accountNumber}
                                onChangeText={(text) => {
                                  const formatted = isPix ? text : formatAccountNumber(text)
                                  setNewRecipient((prev) => ({ ...prev, accountNumber: formatted }))
                                }}
                                placeholder={
                                  corridorRecipientOptions.accountNumberHint ||
                                  ycCorridorSchema?.account_number_hint ||
                                  `${accountLabel} *`
                                }
                                placeholderTextColor={colors.text.secondary}
                                keyboardType={accountKeyboard}
                                autoCapitalize="none"
                                autoComplete="off"
                                autoCorrect={false}
                                textContentType="none"
                                editable={!isSubmitting}
                              />
                            </View>
                          )
                          return (
                            <CorridorRecipientExtraFields
                              fields={extraFields}
                              schema={ycCorridorSchema}
                              values={buildFormYcMetadata()}
                              onChange={(patch) =>
                                setNewRecipient((prev) => ({
                                  ...prev,
                                  ...formPatchFromCorridorExtras(patch),
                                }))
                              }
                              isSubmitting={isSubmitting}
                              accountNumber={accountNumberField}
                            />
                          )
                        })()}
                        {selectedCountryCurrency && selectedRecipientType === 'bank' &&
                        recipientFormNeedsBankCode(
                          getPayoutFieldsSchemaForCorridor({
                            countryCode: selectedCountryCurrency.countryCode,
                            currencyCode: selectedCountryCurrency.currencyCode,
                            rail: 'bank_transfer',
                          }),
                        ) ? (
                          <TextInput
                            style={styles.modalInput}
                            value={newRecipient.swiftBic}
                            onChangeText={(text) =>
                              setNewRecipient(prev => ({ ...prev, swiftBic: text.toUpperCase() }))
                            }
                            placeholder="SWIFT/BIC *"
                            placeholderTextColor={colors.text.secondary}
                            autoCapitalize="characters"
                            returnKeyType="done"
                            onSubmitEditing={() => Keyboard.dismiss()}
                            editable={!isSubmitting}
                          />
                        ) : null}
                      </View>
                    )}

                    {selectedRecipientType === 'bank' && selectedCountryCurrency ? (
                      <PayoutSchemaExtraFields
                        hints={getPayoutFieldsSchemaForCorridor({
                          countryCode: selectedCountryCurrency.countryCode,
                          currencyCode: selectedCountryCurrency.currencyCode,
                          rail: 'bank_transfer',
                        })}
                        values={{
                          email: newRecipient.email,
                          phoneNumber: newRecipient.phoneNumber,
                        }}
                        onChange={(patch) => setNewRecipient((prev) => ({ ...prev, ...patch }))}
                        isSubmitting={isSubmitting}
                      />
                    ) : null}
                    {showsHolderAddress &&
                    selectedCountryCurrency &&
                    accountConfig.accountType !== 'us' ? (
                      <RecipientOperationalAddressFields
                        countryCode={selectedCountryCurrency.countryCode}
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
                        showSubdivisionDropdown={showSubdivisionDropdown}
                        onToggleSubdivisionDropdown={() => {
                          setShowSubdivisionDropdown(!showSubdivisionDropdown)
                          setShowBankDropdown(false)
                          setShowCurrencyDropdown(false)
                          setShowProviderDropdown(false)
                          setShowWalletAssetDropdown(false)
                          setShowWalletNetworkDropdown(false)
                        }}
                        subdivisionSearchTerm={subdivisionSearchTerm}
                        onSubdivisionSearchTermChange={setSubdivisionSearchTerm}
                        onCloseSubdivisionDropdown={() => {
                          setShowSubdivisionDropdown(false)
                          setSubdivisionSearchTerm('')
                        }}
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
            </KeyboardAwareScrollView>
            )}
          </View>
          </RecipientFormDropdownHost>
      </WebAwareModal>

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
    ...searchFieldWrapperStyle,
    gap: spacing[2],
  },
  searchInput: {
    ...searchFieldInputStyle,
    color: colors.text.primary,
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
  /** White SectionCard frame ? flat rows with hairline dividers (More-screen parity). */
  recipientsTray: {
    ...surfaceFrameStyle(colors),
    marginHorizontal: spacing[5],
    overflow: 'hidden',
  },
  listTray: {
    flex: 1,
    minHeight: 0,
    marginBottom: 0,
  },
  list: {
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
  /** Draft Easenet row ? top-trailing corner of the preview block (clear of the chevron). */
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
  modalFormBody: {
    flex: 1,
    minHeight: 0,
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
    ...compactFormInputStyle,
    color: colors.text.primary,
    marginBottom: spacing[4],
    backgroundColor: colors.frame.background,
  },
  modalInputFlush: {
    marginBottom: 0,
  },
  fieldLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing[2],
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
  },
  walletAddressInput: {
    marginBottom: 0,
  },
  walletNicknameInput: {
    paddingRight: spacing[4],
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
    ...dropdownSearchRowStyle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  currencyDropdownSearchInput: {
    ...dropdownSearchInputStyle,
    color: colors.text.primary,
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
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  transferTypeOption: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: colors.frame.background,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 56,
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
  transferTypeOptionSpeed: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },
  transferTypeOptionSpeedSelected: {
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
