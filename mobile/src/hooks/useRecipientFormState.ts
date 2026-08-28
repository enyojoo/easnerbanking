import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import {
  resolvePrimaryPayoutProvider,
  resolveYcCorridorSchema,
} from '@easner/shared'
import { fetchEasenetPublicProfileCached } from '../lib/easenetProfile'
import type { CountryCurrency } from '../lib/countryCurrencyMapping'
import {
  buildRecipientCatalogForType,
  getCorridorRecipientOptions,
  getPayoutFieldsSchemaForCorridor,
  getRecipientProviders,
  getWalletAssets,
  getWalletNetworksForAsset,
  type RecipientType,
} from '../lib/recipientCatalog'
import {
  inferWalletAddressFromApi,
  resolveInferredWalletAssetNetwork,
} from '../lib/walletAddressInference'
import { haptics } from '../lib/haptics'
import { useSendDestinations } from './useSendDestinations'
import {
  buildRecipientYcMetadata,
  coerceTransferType,
  emptyRecipientFormValues,
  eurTransferMethodsForForm,
  hydrateRecipientFormValues,
  isRecipientFormValid,
  recipientFormShowsHolderAddress,
  recipientTypeKeyForForm,
  usTransferMethodsForForm,
  type EasenetProfilePreview,
  type RecipientFormType,
  type RecipientFormValues,
} from '../lib/recipientForm'
import type { Recipient } from '../types'

export type UseRecipientFormStateOptions = {
  hideEasenet?: boolean
  autoOpenAdd?: boolean
  scannedWalletAddress?: string
  onScannedWalletAddressConsumed?: () => void
}

export function useRecipientFormState(options: UseRecipientFormStateOptions = {}) {
  const { hideEasenet = false, autoOpenAdd = false, scannedWalletAddress, onScannedWalletAddressConsumed } =
    options

  const [showRecipientTypeModal, setShowRecipientTypeModal] = useState(false)
  const [showBankAccountForm, setShowBankAccountForm] = useState(false)
  const [showBankDropdown, setShowBankDropdown] = useState(false)
  const [bankSearchTerm, setBankSearchTerm] = useState('')
  const [showSubdivisionDropdown, setShowSubdivisionDropdown] = useState(false)
  const [subdivisionSearchTerm, setSubdivisionSearchTerm] = useState('')
  const [selectedRecipientType, setSelectedRecipientType] = useState<RecipientFormType | null>(null)
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
  const [transferType, setTransferType] = useState<string | null>(null)
  const [easenetProfile, setEasenetProfile] = useState<EasenetProfilePreview | null>(null)
  const [easenetLookupLoading, setEasenetLookupLoading] = useState(false)
  const [easenetLookupError, setEasenetLookupError] = useState<string | null>(null)
  const [newRecipient, setNewRecipient] = useState<RecipientFormValues>(emptyRecipientFormValues())
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null)

  const formScrollRef = useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null)
  const autoOpenAddRef = useRef(false)

  const {
    bankCorridors,
    mobileCorridors,
    cryptoDestinations,
    catalogRevision,
    refresh: refreshCatalog,
  } = useSendDestinations()

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

  const usTransferMethods = useMemo(
    () =>
      usTransferMethodsForForm({
        selectedRecipientType,
        countryCurrency: selectedCountryCurrency,
        payoutProvider,
        hasSelectedBankCorridor: Boolean(selectedBankCorridor),
      }),
    [selectedRecipientType, selectedCountryCurrency, selectedBankCorridor, payoutProvider],
  )

  const eurTransferMethods = useMemo(
    () =>
      eurTransferMethodsForForm({
        selectedRecipientType,
        currency: newRecipient.currency,
        payoutProvider,
        hasSelectedBankCorridor: Boolean(selectedBankCorridor),
      }),
    [selectedRecipientType, newRecipient.currency, selectedBankCorridor, payoutProvider],
  )

  useEffect(() => {
    if (selectedRecipientType !== 'bank' || selectedCountryCurrency?.countryCode !== 'US') return
    setTransferType((current) => coerceTransferType(current, usTransferMethods))
  }, [selectedRecipientType, selectedCountryCurrency?.countryCode, usTransferMethods])

  useEffect(() => {
    if (selectedRecipientType !== 'bank' || newRecipient.currency !== 'EUR') return
    setTransferType((current) => coerceTransferType(current, eurTransferMethods))
  }, [selectedRecipientType, newRecipient.currency, eurTransferMethods])

  const corridorRecipientOptions = useMemo(() => {
    if (!selectedCountryCurrency) {
      return {
        bankOptions: [] as string[],
        momoOptions: [] as string[],
        momoCandidates: [],
        extraFields: [],
        accountNumberLabel: undefined as string | undefined,
        accountNumberHint: undefined as string | undefined,
      }
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

  const validationContext = useMemo(
    () => ({
      values: newRecipient,
      selectedRecipientType,
      selectedCountryCurrency,
      transferType,
      usTransferMethods,
      eurTransferMethods,
      corridorRecipientOptions,
      easenetProfile,
      payoutProvider,
      ycCorridorSchema,
      selectedBankCorridorFieldsSchema: selectedBankCorridor?.fields_schema,
    }),
    [
      newRecipient,
      selectedRecipientType,
      selectedCountryCurrency,
      transferType,
      usTransferMethods,
      eurTransferMethods,
      corridorRecipientOptions,
      easenetProfile,
      payoutProvider,
      ycCorridorSchema,
      selectedBankCorridor,
    ],
  )

  const isValid = useMemo(() => isRecipientFormValid(validationContext), [validationContext])

  const bankSchemaHints = useMemo(
    () =>
      selectedCountryCurrency && selectedRecipientType === 'bank'
        ? getPayoutFieldsSchemaForCorridor({
            countryCode: selectedCountryCurrency.countryCode,
            currencyCode: selectedCountryCurrency.currencyCode,
            rail: 'bank_transfer',
          })
        : null,
    [selectedCountryCurrency, selectedRecipientType],
  )

  const showsHolderAddress = useMemo(
    () => recipientFormShowsHolderAddress(validationContext),
    [validationContext],
  )

  const buildFormYcMetadata = useCallback(
    () => buildRecipientYcMetadata(newRecipient, selectedCountryCurrency?.countryCode),
    [newRecipient, selectedCountryCurrency?.countryCode],
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

  useEffect(() => {
    if (!scannedWalletAddress) return
    setNewRecipient((prev) => ({ ...prev, walletAddress: scannedWalletAddress }))
    applyWalletAddressInference(scannedWalletAddress)
    onScannedWalletAddressConsumed?.()
  }, [scannedWalletAddress, applyWalletAddressInference, onScannedWalletAddressConsumed])

  useEffect(() => {
    if (!autoOpenAdd || autoOpenAddRef.current) return
    autoOpenAddRef.current = true
    setShowRecipientTypeModal(true)
  }, [autoOpenAdd])

  useEffect(() => {
    if (selectedRecipientType !== 'easenet' || !showBankAccountForm) return
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
  }, [selectedRecipientType, showBankAccountForm, newRecipient.payeeEasetag])

  const recipientTypeKey = recipientTypeKeyForForm(selectedRecipientType)

  const filteredCurrencies = useMemo(() => {
    return recipientCatalogFor(recipientTypeKey).filter((currency) => {
      if (!currencySearchTerm) return true
      const q = currencySearchTerm.toLowerCase()
      return (
        currency.currencyName.toLowerCase().includes(q) ||
        currency.currencyCode.toLowerCase().includes(q) ||
        currency.countryName.toLowerCase().includes(q)
      )
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
      recipientCatalogFor(recipientTypeKey).find(
        (item) =>
          item.currencyCode === newRecipient.currency &&
          item.countryCode === selectedCountryCurrency?.countryCode,
      ) ||
      recipientCatalogFor(recipientTypeKey).find((item) => item.currencyCode === newRecipient.currency),
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

  const closeAllDropdowns = useCallback(() => {
    setShowCurrencyDropdown(false)
    setShowProviderDropdown(false)
    setShowWalletAssetDropdown(false)
    setShowWalletNetworkDropdown(false)
    setShowBankDropdown(false)
    setShowSubdivisionDropdown(false)
    setCurrencySearchTerm('')
    setProviderSearchTerm('')
    setWalletAssetSearchTerm('')
    setWalletNetworkSearchTerm('')
    setBankSearchTerm('')
    setSubdivisionSearchTerm('')
  }, [])

  const resetForm = useCallback(() => {
    setNewRecipient(emptyRecipientFormValues())
    setEasenetProfile(null)
    setEasenetLookupError(null)
    setEasenetLookupLoading(false)
    setSelectedRecipientType(null)
    setEditingRecipient(null)
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
  }, [])

  const openAdd = useCallback(() => {
    resetForm()
    setShowRecipientTypeModal(true)
  }, [resetForm])

  const openEdit = useCallback((recipient: Recipient) => {
    resetForm()
    setEditingRecipient(recipient)
    const hydrated = hydrateRecipientFormValues(recipient)
    setSelectedRecipientType(hydrated.inferredType)
    setSelectedCountryCurrency(hydrated.countryCurrency)
    setTransferType(hydrated.transferType)
    setEasenetProfile(hydrated.easenetProfile)
    setNewRecipient(hydrated.values)
    setShowBankAccountForm(true)
  }, [resetForm])

  const setField = useCallback((patch: Partial<RecipientFormValues>) => {
    setNewRecipient((prev) => ({ ...prev, ...patch }))
  }, [])

  const selectRecipientType = useCallback(
    (type: RecipientFormType) => {
      haptics.tap()
      if (type === 'wallet') {
        const firstAsset = getWalletAssets()[0] || 'USDT'
        const firstNetwork = getWalletNetworksForAsset(firstAsset)[0] || ''
        setSelectedRecipientType('wallet')
        setNewRecipient((prev) => ({ ...prev, currency: firstAsset, network: firstNetwork }))
      } else if (type === 'bank') {
        setSelectedRecipientType('bank')
        setSelectedCountryCurrency({
          countryCode: 'US',
          countryName: 'United States',
          currencyCode: 'USD',
          currencyName: 'US Dollar',
          flagEmoji: '',
        })
        setNewRecipient((prev) => ({ ...prev, currency: 'USD' }))
      } else if (type === 'mobile') {
        const firstMobile = recipientCatalogFor('mobile_money')[0]
        const firstCurrency = firstMobile?.currencyCode || 'KES'
        const firstProvider =
          getRecipientProviders(firstCurrency, 'mobile_money', firstMobile?.countryCode)[0] || ''
        setSelectedRecipientType('mobile')
        setSelectedCountryCurrency({
          countryCode: firstMobile?.countryCode || 'KE',
          countryName: firstMobile?.countryName || 'Kenya',
          currencyCode: firstCurrency,
          currencyName: firstMobile?.currencyName || 'Kenyan Shilling',
          flagEmoji: '',
        })
        setNewRecipient((prev) => ({ ...prev, currency: firstCurrency, provider: firstProvider }))
      } else if (type === 'easenet') {
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
      }
      setShowRecipientTypeModal(false)
      setShowBankAccountForm(true)
    },
    [recipientCatalogFor],
  )

  const handleWalletScanPress = useCallback(() => {
    closeAllDropdowns()
    setShowWalletAddressScanner(true)
  }, [closeAllDropdowns])

  return {
    hideEasenet,
    showRecipientTypeModal,
    setShowRecipientTypeModal,
    showBankAccountForm,
    setShowBankAccountForm,
    showBankDropdown,
    setShowBankDropdown,
    bankSearchTerm,
    setBankSearchTerm,
    showSubdivisionDropdown,
    setShowSubdivisionDropdown,
    subdivisionSearchTerm,
    setSubdivisionSearchTerm,
    selectedRecipientType,
    setSelectedRecipientType,
    showCurrencyDropdown,
    setShowCurrencyDropdown,
    showProviderDropdown,
    setShowProviderDropdown,
    showWalletAssetDropdown,
    setShowWalletAssetDropdown,
    showWalletNetworkDropdown,
    setShowWalletNetworkDropdown,
    currencySearchTerm,
    setCurrencySearchTerm,
    providerSearchTerm,
    setProviderSearchTerm,
    walletAssetSearchTerm,
    setWalletAssetSearchTerm,
    walletNetworkSearchTerm,
    setWalletNetworkSearchTerm,
    showWalletAddressScanner,
    setShowWalletAddressScanner,
    isSubmitting,
    setIsSubmitting,
    error,
    setError,
    selectedCountryCurrency,
    setSelectedCountryCurrency,
    transferType,
    setTransferType,
    easenetProfile,
    easenetLookupLoading,
    easenetLookupError,
    newRecipient,
    setNewRecipient,
    editingRecipient,
    formScrollRef,
    recipientCatalogFor,
    selectedBankCorridor,
    payoutProvider,
    usTransferMethods,
    eurTransferMethods,
    corridorRecipientOptions,
    ycCorridorSchema,
    validationContext,
    isValid,
    bankSchemaHints,
    showsHolderAddress,
    buildFormYcMetadata,
    applyWalletAddressInference,
    filteredCurrencies,
    walletAssetOptions,
    walletNetworkOptions,
    filteredWalletAssets,
    filteredWalletNetworks,
    selectedCatalogEntry,
    isAnyDropdownOpen,
    closeAllDropdowns,
    resetForm,
    openAdd,
    openEdit,
    setField,
    selectRecipientType,
    handleWalletScanPress,
    refreshCatalog,
  }
}

export type UseRecipientFormStateReturn = ReturnType<typeof useRecipientFormState>
