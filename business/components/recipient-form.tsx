"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Loader2, User, Phone, CreditCard, MapPin, ChevronDown } from "lucide-react"
import {
  recipientFormNeedsAddress,
  recipientFormNeedsBankCode,
  recipientFormNeedsEmail,
  normalizeRecipientYcMetadata,
  isBankNameAllowedForCorridor,
  isMomoProviderAllowedForCorridor,
  resolveCorridorRecipientOptions,
  resolveYcCorridorSchema,
  sortByEasnerCountryPickerOrder,
  unwrapNoahFieldsSchema,
  validateYcRecipientForCorridor,
  ycAccountNumberLabel,
  type RecipientYcMetadata,
} from "@easner/shared"
import type { Beneficiary } from "@/lib/recipient-types"
import { CountryFlag } from "@/components/flags"
import { MobileMoneyProviderIcon } from "@/lib/mobile-money-icons"
import { useSendDestinations } from "@/lib/use-send-destinations"
import { PayoutBankCombobox } from "@/components/payout-bank-combobox"
import { DYNAMIC_COMBOBOX_LIST_CLASS } from "@/lib/combobox-list-class"
import { getNetworkIconUrl, getTokenIconUrl } from "@/lib/crypto-icons"
import {
  WALLET_ASSET_NETWORKS,
  DEFAULT_WALLET_ASSET,
  walletAssetNetworksFromCatalog,
} from "@/lib/wallet-asset-networks"
import {
  coerceBeneficiaryEasenetDisplay,
  createRecipient,
  updateRecipient,
  type RecipientUpsertInput,
} from "@/lib/recipients-store"
import { fetchEasenetProfileByTag } from "@/lib/easenet-profile"
import { writeEasenetPublicProfileCache } from "@/lib/easenet-public-profile-cache"
import { EasenetRecipientProfileRow } from "@/components/easenet-recipient-profile-row"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { resolveInferredWalletAssetNetwork } from "@easner/shared"
import { inferWalletAddressFromApi } from "@/lib/wallet-send/infer-wallet-address-client"
import { YcRecipientExtraFields } from "@/components/recipients/yc-recipient-extra-fields"

const RECIPIENT_TYPE_TABS = [
  { id: "bank" as const, label: "Bank Account" },
  { id: "mobile" as const, label: "Mobile Money" },
  { id: "wallet" as const, label: "Wallet Address" },
  { id: "easenet" as const, label: "Easetag" },
]

type RailCountryOption = { name: string; currency: string; code: string }

export type RecipientFormRecipientKind = "bank" | "mobile" | "wallet" | "easenet"

interface RecipientFormProps {
  recipient?: any
  onSuccess: () => void
  isEdit?: boolean
  formId?: string
  hideSubmitButton?: boolean
  onSubmittingChange?: (submitting: boolean) => void
  /** When provided and in add mode, called with the new beneficiary before onSuccess */
  onSuccessWithData?: (beneficiary: Beneficiary) => void
  /**
   * Receives a fully validated form payload without writing to the recipients
   * store. Payroll uses this to keep receiving details inside Payroll.
   */
  onValidatedSubmit?: (input: RecipientUpsertInput) => void | Promise<void>
  /**
   * Limits the Recipient Type control (e.g. terminal payouts: bank + mobile only).
   * When omitted, all types are available.
   */
  allowedRecipientTypes?: RecipientFormRecipientKind[]
  /** Overrides primary submit label in add mode (e.g. "Save payout"). */
  submitButtonLabel?: string
  /** Payroll embeds the same validation without recipient-management terminology. */
  terminology?: "recipient" | "payroll"
}

function inferRecipientType(recipient?: Beneficiary): "bank" | "mobile" | "wallet" | "easenet" {
  if (!recipient) return "bank"
  const bname = String(recipient.bankName || "").toLowerCase()
  if (recipient.payeeEasetag || bname.includes("easenet") || bname.includes("easetag")) {
    return "easenet"
  }
  const bankName = String(recipient.bankName || "").toLowerCase()
  if (bankName.includes("wallet") || recipient.walletNetwork || recipient.walletAsset) return "wallet"
  if (bankName.includes("mobile money") || recipient.mobileProvider) return "mobile"
  return "bank"
}

const mobileMoneyProvidersByCurrency: Record<string, string[]> = {
  BWP: ["MyZaka"],
  XOF: ["MTN", "Orange", "Moov Money", "Wave", "Free"],
  XAF: ["MTN", "Orange", "Moov Money"],
  KES: ["Airtel Money", "M-PESA"],
  GHS: ["AirtelTigo", "MTN MoMo", "Vodafone"],
  MWK: ["Airtel Money", "TNM"],
  RWF: ["Airtel Money"],
  TZS: ["Airtel Money", "TigoPesa"],
  UGX: ["Airtel Money", "MTN"],
  ZMW: ["Airtel Money", "MTN", "TNM"],
  PHP: ["GCash", "Maya"],
  INR: ["UPI"],
}

export function RecipientForm({
  recipient,
  onSuccess,
  isEdit = false,
  formId,
  hideSubmitButton = false,
  onSubmittingChange,
  onSuccessWithData,
  onValidatedSubmit,
  allowedRecipientTypes,
  submitButtonLabel,
  terminology = "recipient",
}: RecipientFormProps) {
  const recipientTypeTabs = useMemo(() => {
    if (!allowedRecipientTypes?.length) return RECIPIENT_TYPE_TABS
    const allow = new Set(allowedRecipientTypes)
    const filtered = RECIPIENT_TYPE_TABS.filter((t) => allow.has(t.id))
    return filtered.length > 0 ? filtered : RECIPIENT_TYPE_TABS
  }, [allowedRecipientTypes])

  const recipientTabCount = Math.max(1, recipientTypeTabs.length)
  const [formData, setFormData] = useState({
    recipientType:
      isEdit && recipient ? inferRecipientType(coerceBeneficiaryEasenetDisplay(recipient as Beneficiary)) : "bank",
    name: "",
    bankName: "",
    accountNumber: "",
    routingNumber: "",
    iban: "",
    bic: "",
    sortCode: "",
    country: "United States",
    phone: "",
    email: "",
    walletAsset: DEFAULT_WALLET_ASSET,
    walletNetwork: "",
    walletAddress: "",
    mobileProvider: "",
    transferType: "ACH",
    checkingOrSavings: "",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
    easenetTag: "",
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [ycMetadata, setYcMetadata] = useState<RecipientYcMetadata>({})
  const [countryOpen, setCountryOpen] = useState(false)
  const [walletAssetOpen, setWalletAssetOpen] = useState(false)
  const [walletNetworkOpen, setWalletNetworkOpen] = useState(false)
  const [mobileProviderOpen, setMobileProviderOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [easenetResolved, setEasenetResolved] = useState<{
    easetag: string
    fullName: string
    avatarUrl: string | null
    accountKind: "business" | "personal"
  } | null>(null)
  const [easenetLookupLoading, setEasenetLookupLoading] = useState(false)
  const [easenetLookupError, setEasenetLookupError] = useState<string | null>(null)
  const walletInferSeqRef = useRef(0)

  useEffect(() => {
    onSubmittingChange?.(isSubmitting)
  }, [isSubmitting, onSubmittingChange])

  const {
    bankCorridors,
    mobileCorridors,
    cryptoDestinations,
    loading: bankCorridorsLoading,
    refresh: refreshSendDestinations,
  } = useSendDestinations()

  useEffect(() => {
    void refreshSendDestinations()
  }, [refreshSendDestinations])
  const mobileCorridorsLoading = bankCorridorsLoading
  const walletAssetNetworks = useMemo(() => {
    const fromApi = walletAssetNetworksFromCatalog(cryptoDestinations)
    return Object.keys(fromApi).length ? fromApi : WALLET_ASSET_NETWORKS
  }, [cryptoDestinations])

  /** When corridors are empty, infer a single row from saved recipient fields (edit mode). */
  const resolveCountryByRecipient = (r: Beneficiary): RailCountryOption | undefined => {
    const code = r.countryCode
    const name = String(r.country || "").trim()
    const cur = r.currency || "USD"
    if (code && name) return { name, currency: cur, code }
    if (code) return { name: code, currency: cur, code }
    return undefined
  }

  useEffect(() => {
    if (recipient && isEdit) {
      const bene = coerceBeneficiaryEasenetDisplay(recipient as Beneficiary)
      const walletMatch = bene.bankName?.match(/^Wallet \((.*)\)$/i)
      const mobileMatch = bene.bankName?.match(/^Mobile Money \((.*)\)$/i)
      const mobileInner = mobileMatch?.[1] || ""
      const normalizedMobileProvider = mobileInner.includes("|CC:") ? mobileInner.split("|CC:")[0] : mobileInner
      const descriptor = walletMatch?.[1] || ""
      const [parsedWalletAsset, parsedWalletNetwork] = descriptor.includes("/")
        ? descriptor.split("/")
        : [bene.currency || "USDT", descriptor || ""]
      const inferredType = inferRecipientType(bene)
      if (inferredType === "easenet" && bene.payeeEasetag) {
        setEasenetResolved({
          easetag: bene.payeeEasetag,
          fullName: bene.name || bene.payeeEasetag,
          avatarUrl: bene.avatarUrl ?? null,
          accountKind: bene.payeeAccountKind === "business" ? "business" : "personal",
        })
        setEasenetLookupError(null)
      } else {
        setEasenetResolved(null)
        setEasenetLookupError(null)
      }
      const recipientCountryCode = bene.countryCode
      const bankOpts = bankCorridors.map((c) => ({
        name: c.country_name,
        currency: c.currency_code,
        code: c.country_code,
      }))
      const mobileOpts = mobileCorridors.map((c) => ({
        name: c.country_name,
        currency: c.currency_code,
        code: c.country_code,
      }))
      const countryOptionsForType = inferredType === "mobile" ? mobileOpts : bankOpts
      const matchedCountryFromCodeInType = countryOptionsForType.find((c) => c.code === recipientCountryCode)
      const combinedAny = [...bankOpts, ...mobileOpts]
      const matchedCountryFromCodeAny = combinedAny.find((c) => c.code === recipientCountryCode)
      const matchedCountry =
        matchedCountryFromCodeInType || matchedCountryFromCodeAny || resolveCountryByRecipient(bene)
      setFormData({
        name: bene.name || "",
        recipientType: inferredType,
        bankName: bene.bankName || "",
        accountNumber: bene.fullAccountNumber || bene.accountNumber || "",
        routingNumber: bene.routingNumber || "",
        iban: bene.iban || "",
        bic: bene.bic || "",
        sortCode: bene.sortCode || "",
        country: matchedCountry?.name || bene.country || "United States",
        phone: bene.phone || (inferredType === "mobile" ? bene.fullAccountNumber || bene.accountNumber || "" : ""),
        email: bene.email || "",
        walletAsset: bene.walletAsset || parsedWalletAsset || bene.currency || "USDT",
        walletNetwork: bene.walletNetwork || parsedWalletNetwork || "",
        walletAddress: bene.fullAccountNumber || bene.accountNumber || "",
        mobileProvider: bene.mobileProvider || normalizedMobileProvider || "",
        transferType: bene.transferType || "ACH",
        checkingOrSavings: bene.checkingOrSavings || "",
        addressLine1: bene.addressLine1 || "",
        city: bene.city || "",
        state: bene.state || "",
        postalCode: bene.postalCode || "",
        easenetTag: inferredType === "easenet" ? bene.payeeEasetag || bene.accountNumber || "" : "",
      })
      setYcMetadata(normalizeRecipientYcMetadata(bene.ycMetadata))
    }
  }, [recipient, isEdit, bankCorridors, mobileCorridors])

  useEffect(() => {
    if (formData.recipientType !== "easenet") {
      return
    }
    const raw = formData.easenetTag.trim()
    if (raw.length < 4) {
      setEasenetResolved(null)
      setEasenetLookupError(null)
      setEasenetLookupLoading(false)
      return
    }
    let cancelled = false
    setEasenetLookupLoading(true)
    setEasenetLookupError(null)
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await fetchEasenetProfileByTag(raw)
        if (cancelled) return
        setEasenetLookupLoading(false)
        if (res.found) {
          setEasenetResolved({
            easetag: res.easetag,
            fullName: res.fullName,
            avatarUrl: res.avatarUrl,
            accountKind: res.accountKind,
          })
          setEasenetLookupError(null)
        } else {
          setEasenetResolved(null)
          setEasenetLookupError(
            res.reason === "self" ? "You cannot add yourself as a recipient." : "Easetag not found.",
          )
        }
      })()
    }, 450)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [formData.easenetTag, formData.recipientType])

  const applyWalletAddressInference = useCallback((address: string, networksByAsset: Record<string, string[]>) => {
    const trimmed = address.trim()
    if (trimmed.length < 8) return
    const seq = ++walletInferSeqRef.current
    void inferWalletAddressFromApi(trimmed)
      .then(({ best, candidates }) => {
        if (seq !== walletInferSeqRef.current || !best) return
        setFormData((prev) => {
          const { asset, network } = resolveInferredWalletAssetNetwork({
            candidates,
            best,
            previousAsset: prev.walletAsset,
            previousNetwork: prev.walletNetwork,
            networksByAsset,
          })
          return {
            ...prev,
            walletAsset: asset,
            walletNetwork: network,
          }
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (formData.recipientType !== "wallet") return
    const t = window.setTimeout(() => {
      applyWalletAddressInference(formData.walletAddress, walletAssetNetworks)
    }, 450)
    return () => window.clearTimeout(t)
  }, [formData.walletAddress, formData.recipientType, walletAssetNetworks, applyWalletAddressInference])

  const bankFromApi = bankCorridors.length > 0
  const mobileFromApi = mobileCorridors.length > 0

  const bankCountriesFlat = useMemo(() => {
    const seen = new Set<string>()
    const rows: RailCountryOption[] = []
    for (const c of bankCorridors) {
      const key = `${c.country_code}:${c.currency_code}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        name: c.country_name,
        currency: c.currency_code,
        code: c.country_code,
      })
    }
    return sortByEasnerCountryPickerOrder(
      rows,
      (r) => r.code,
      (r) => r.name,
      (r) => r.currency,
    )
  }, [bankCorridors])

  const mobileCountriesFlat = useMemo(() => {
    const seen = new Set<string>()
    const rows: RailCountryOption[] = []
    for (const c of mobileCorridors) {
      const key = `${c.country_code}:${c.currency_code}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        name: c.country_name,
        currency: c.currency_code,
        code: c.country_code,
      })
    }
    return sortByEasnerCountryPickerOrder(
      rows,
      (r) => r.code,
      (r) => r.name,
      (r) => r.currency,
    )
  }, [mobileCorridors])

  const countryOptions = useMemo(() => {
    if (formData.recipientType === "mobile") return mobileCountriesFlat
    if (formData.recipientType === "bank") return bankCountriesFlat
    return []
  }, [formData.recipientType, mobileCountriesFlat, bankCountriesFlat])

  const allCountriesForLookup = useMemo(() => {
    return [...bankCountriesFlat, ...mobileCountriesFlat]
  }, [bankCountriesFlat, mobileCountriesFlat])

  const payoutCorridorsLoading =
    (formData.recipientType === "mobile" && mobileCorridorsLoading) ||
    (formData.recipientType === "bank" && bankCorridorsLoading)

  const selectedCountry = countryOptions.find((c) => c.name === formData.country)
  const currency = selectedCountry?.currency || "USD"
  const payoutRail = formData.recipientType === "mobile" ? ("mobile_money" as const) : ("bank_transfer" as const)
  const selectedCorridorRow = useMemo(() => {
    if (!selectedCountry) return null
    const list = payoutRail === "mobile_money" ? mobileCorridors : bankCorridors
    return (
      list.find((c) => c.country_code === selectedCountry.code && c.currency_code === selectedCountry.currency) ?? null
    )
  }, [selectedCountry, payoutRail, bankCorridors, mobileCorridors])
  const corridorRecipientOptions = useMemo(() => {
    if (!selectedCountry) {
      return {
        bankOptions: [] as string[],
        momoOptions: [] as string[],
        momoCandidates: [],
        extraFields: [],
        accountNumberLabel: undefined,
        accountNumberHint: undefined,
      }
    }
    return resolveCorridorRecipientOptions({
      countryCode: selectedCountry.code,
      currencyCode: currency,
      rail: payoutRail,
      fieldsSchema: selectedCorridorRow?.fields_schema,
      providers: selectedCorridorRow?.providers,
    })
  }, [selectedCountry, currency, payoutRail, selectedCorridorRow])
  const payoutFormHints = unwrapNoahFieldsSchema(selectedCorridorRow?.fields_schema)
  const ycCorridorSchema = useMemo(() => {
    if (!selectedCountry) return null
    return resolveYcCorridorSchema({
      countryCode: selectedCountry.code,
      currencyCode: currency,
      fieldsSchema: selectedCorridorRow?.fields_schema,
    })
  }, [selectedCountry, currency, selectedCorridorRow])
  const bankEnumOptions = corridorRecipientOptions.bankOptions.length
    ? corridorRecipientOptions.bankOptions
    : ycCorridorSchema?.bank_enum?.length
      ? ycCorridorSchema.bank_enum
      : (payoutFormHints?.bank_enum ?? [])

  const mobileProviderChoices = useMemo(() => {
    if (formData.recipientType !== "mobile") return [] as string[]
    if (corridorRecipientOptions.momoOptions.length) return corridorRecipientOptions.momoOptions
    if (mobileFromApi && selectedCountry) {
      const row = mobileCorridors.find(
        (c) => c.country_code === selectedCountry.code && c.currency_code === selectedCountry.currency,
      )
      const fromProviders = row?.providers
      if (Array.isArray(fromProviders) && fromProviders.length > 0) {
        return fromProviders.map((p) => String(p)).filter(Boolean)
      }
      const fromSchema = row?.fields_schema?.mobile_provider_labels
      if (fromSchema?.length) return fromSchema
      return []
    }
    return mobileMoneyProvidersByCurrency[currency] || ["Other"]
  }, [
    formData.recipientType,
    corridorRecipientOptions.momoOptions,
    mobileFromApi,
    selectedCountry,
    mobileCorridors,
    currency,
  ])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (formData.recipientType === "easenet") {
      if (!easenetResolved) {
        newErrors.easenetTag = "Enter a valid Easetag and wait for the profile to load"
      }
      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    }

    if (!formData.name.trim()) {
      newErrors.name = "Recipient name is required"
    }

    if (formData.recipientType === "bank" && !formData.bankName.trim()) {
      newErrors.bankName = "Bank name is required"
    }

    if (formData.recipientType === "bank" && !formData.accountNumber.trim()) {
      newErrors.accountNumber = "Account number is required"
    }

    if (formData.recipientType === "bank" && !formData.country) {
      newErrors.country = "Country is required"
    }

    if (formData.recipientType === "mobile") {
      if (!formData.country) newErrors.country = "Country is required"
      if (!formData.mobileProvider.trim()) newErrors.mobileProvider = "Provider is required"
      if (!formData.phone.trim()) newErrors.phone = "Phone number is required"
    }

    if (formData.recipientType === "wallet") {
      if (!formData.walletAsset.trim()) newErrors.walletAsset = "Asset is required"
      if (!formData.walletNetwork.trim()) newErrors.walletNetwork = "Network is required"
      if (!formData.walletAddress.trim()) newErrors.walletAddress = "Wallet address is required"
    }

    // Currency-specific validation
    if (formData.recipientType === "bank" && currency === "USD" && !formData.routingNumber.trim()) {
      newErrors.routingNumber = "Routing number is required for USD"
    }
    if (formData.recipientType === "bank" && currency === "USD" && !formData.transferType.trim()) {
      newErrors.transferType = "Transfer type is required for USD"
    }
    if (
      formData.recipientType === "bank" &&
      currency === "USD" &&
      formData.transferType !== "Wire" &&
      !formData.checkingOrSavings.trim()
    ) {
      newErrors.checkingOrSavings = "Account type is required for USD ACH"
    }
    if (formData.recipientType === "bank" && currency === "USD" && !formData.addressLine1.trim()) {
      newErrors.addressLine1 = "Street address is required for USD"
    }
    if (formData.recipientType === "bank" && currency === "USD" && !formData.city.trim()) {
      newErrors.city = "City is required for USD"
    }
    if (formData.recipientType === "bank" && currency === "USD" && !formData.state.trim()) {
      newErrors.state = "State is required for USD"
    }
    if (formData.recipientType === "bank" && currency === "USD" && !formData.postalCode.trim()) {
      newErrors.postalCode = "ZIP code is required for USD"
    }

    if (formData.recipientType === "bank" && currency === "EUR") {
      if (!formData.iban.trim()) {
        newErrors.iban = "IBAN is required for EUR"
      }
    }

    if (
      formData.recipientType === "bank" &&
      bankEnumOptions.length > 0 &&
      formData.bankName.trim() &&
      !isBankNameAllowedForCorridor(formData.bankName.trim(), corridorRecipientOptions)
    ) {
      newErrors.bankName = "Select a bank from the list"
    }

    if (
      formData.recipientType === "mobile" &&
      corridorRecipientOptions.momoOptions.length > 0 &&
      formData.mobileProvider.trim() &&
      !isMomoProviderAllowedForCorridor(formData.mobileProvider.trim(), corridorRecipientOptions)
    ) {
      newErrors.mobileProvider = "Select a provider from the list"
    }

    if (formData.recipientType === "bank" && currency === "USD" && formData.transferType === "Wire") {
      delete newErrors.checkingOrSavings
    }

    if (formData.recipientType === "bank" && payoutFormHints?.needs_phone && !formData.phone.trim()) {
      newErrors.phone = "Phone number is required for this corridor"
    }

    const needsAddress =
      formData.recipientType === "bank" && recipientFormNeedsAddress({ hints: payoutFormHints, currencyCode: currency })
    if (needsAddress && currency !== "USD") {
      if (!formData.addressLine1.trim()) newErrors.addressLine1 = "Street address is required"
      if (!formData.city.trim()) newErrors.city = "City is required"
      if (!formData.state.trim()) newErrors.state = "State / region is required"
      if (!formData.postalCode.trim()) newErrors.postalCode = "Postal code is required"
    }

    if (formData.recipientType === "bank" && recipientFormNeedsEmail(payoutFormHints)) {
      const em = formData.email.trim()
      if (!em) newErrors.email = "Email is required for this corridor"
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        newErrors.email = "Enter a valid email address"
      }
    }

    if (formData.recipientType === "bank" && currency === "CAD" && !formData.sortCode.trim()) {
      newErrors.sortCode = "Branch code is required for CAD"
    }

    if (formData.recipientType === "bank" && currency === "GBP" && !formData.sortCode.trim()) {
      newErrors.sortCode = "Sort code is required for GBP"
    }

    if (formData.recipientType === "bank" && currency === "CAD" && !formData.routingNumber.trim()) {
      newErrors.routingNumber = "Routing number is required for CAD (CPA format)"
    }

    if (formData.recipientType === "bank" && recipientFormNeedsBankCode(payoutFormHints)) {
      const swift = formData.bic?.trim() || ""
      if (!swift) {
        newErrors.bic = "SWIFT/BIC is required for this corridor"
      } else if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/i.test(swift)) {
        newErrors.bic = "Enter a valid SWIFT/BIC code"
      }
    }

    if (formData.recipientType === "bank" && selectedCountry && ycCorridorSchema?.status === "ready") {
      const ycCheck = validateYcRecipientForCorridor({
        countryCode: selectedCountry.code,
        currencyCode: currency,
        fieldsSchema: selectedCorridorRow?.fields_schema,
        row: {
          country_code: selectedCountry.code,
          currency,
          full_name: formData.name,
          account_number: formData.accountNumber,
          bank_name: formData.bankName,
          phone_number: formData.phone,
          metadata: ycMetadata,
        },
      })
      if (!ycCheck.ok) {
        newErrors.accountNumber = ycCheck.message
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!validateForm()) return

    if (formData.recipientType === "easenet" && easenetResolved) {
      writeEasenetPublicProfileCache(easenetResolved.easetag, {
        fullName: easenetResolved.fullName,
        avatarUrl: easenetResolved.avatarUrl,
        accountKind: easenetResolved.accountKind,
      })
      const payload: RecipientUpsertInput = {
        recipientType: "easenet",
        countryCode: "US",
        fullName: easenetResolved.fullName,
        accountNumber: easenetResolved.easetag,
        bankName: "",
        currency: "USD",
        payeeEasetag: easenetResolved.easetag,
      }
      try {
        setIsSubmitting(true)
        if (onValidatedSubmit) {
          await onValidatedSubmit(payload)
          onSuccess()
          return
        }
        const beneficiary =
          isEdit && recipient?.id ? await updateRecipient(recipient.id, payload) : await createRecipient(payload)
        onSuccessWithData?.(beneficiary)
        onSuccess()
      } catch (err) {
        console.error("Failed to save recipient:", err instanceof Error ? err.message : err)
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    const selectedCountry = allCountriesForLookup.find((c) => c.name === formData.country)
    const currency = formData.recipientType === "wallet" ? formData.walletAsset : selectedCountry?.currency || "USD"
    const isUsdBank = formData.recipientType === "bank" && currency === "USD"
    const payload: RecipientUpsertInput = {
      recipientType: formData.recipientType as "bank" | "mobile" | "wallet",
      countryCode: selectedCountry?.code,
      fullName: formData.name.trim(),
      accountNumber:
        formData.recipientType === "wallet"
          ? formData.walletAddress.trim()
          : formData.recipientType === "mobile"
            ? formData.phone.trim()
            : formData.accountNumber.trim(),
      bankName: formData.recipientType === "bank" ? formData.bankName.trim() : "",
      currency,
      phoneNumber:
        formData.recipientType === "mobile" || payoutFormHints?.needs_phone
          ? formData.phone.trim() || undefined
          : undefined,
      mobileProvider: formData.recipientType === "mobile" ? formData.mobileProvider.trim() || undefined : undefined,
      walletAsset: formData.recipientType === "wallet" ? formData.walletAsset.trim() || undefined : undefined,
      walletNetwork: formData.recipientType === "wallet" ? formData.walletNetwork.trim() || undefined : undefined,
      routingNumber: formData.routingNumber?.trim() || undefined,
      sortCode: formData.sortCode?.trim() || undefined,
      iban: formData.iban?.trim() || undefined,
      swiftBic: formData.recipientType === "bank" ? formData.bic?.trim() || undefined : undefined,
      transferType: isUsdBank ? (formData.transferType as "ACH" | "Wire") : undefined,
      checkingOrSavings: isUsdBank ? (formData.checkingOrSavings as "checking" | "savings") : undefined,
      email: recipientFormNeedsEmail(payoutFormHints) && formData.email.trim() ? formData.email.trim() : undefined,
      addressLine1:
        isUsdBank || recipientFormNeedsAddress({ hints: payoutFormHints, currencyCode: currency })
          ? formData.addressLine1.trim()
          : undefined,
      city:
        isUsdBank || recipientFormNeedsAddress({ hints: payoutFormHints, currencyCode: currency })
          ? formData.city.trim()
          : undefined,
      state:
        isUsdBank || recipientFormNeedsAddress({ hints: payoutFormHints, currencyCode: currency })
          ? formData.state.trim()
          : undefined,
      postalCode:
        isUsdBank || recipientFormNeedsAddress({ hints: payoutFormHints, currencyCode: currency })
          ? formData.postalCode.trim()
          : undefined,
      ycMetadata: formData.recipientType === "bank" ? normalizeRecipientYcMetadata(ycMetadata) : undefined,
    }

    try {
      setIsSubmitting(true)
      if (onValidatedSubmit) {
        await onValidatedSubmit(payload)
        onSuccess()
        return
      }
      const beneficiary =
        isEdit && recipient?.id ? await updateRecipient(recipient.id, payload) : await createRecipient(payload)
      onSuccessWithData?.(beneficiary)
      onSuccess()
    } catch (err) {
      console.error("Failed to save recipient:", err instanceof Error ? err.message : err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  const getAccountIdentifierLabel = (currency: string) => {
    const ycLabel = ycAccountNumberLabel(ycCorridorSchema)
    if (ycLabel) return ycLabel
    switch (currency) {
      case "EUR":
        return "IBAN"
      case "GBP":
        return "Account Number"
      case "USD":
      case "NGN":
      default:
        return "Account Number"
    }
  }

  const selectRecipientType = (type: "bank" | "mobile" | "wallet" | "easenet") => {
    if (type === "easenet") {
      handleInputChange("recipientType", "easenet")
      handleInputChange("easenetTag", "")
      handleInputChange("country", "United States")
      setEasenetResolved(null)
      setEasenetLookupError(null)
      setEasenetLookupLoading(false)
      return
    }
    if (type === "bank") {
      handleInputChange("recipientType", "bank")
      const first = bankCountriesFlat[0]
      handleInputChange("country", first?.name || "")
      handleInputChange("mobileProvider", "")
      handleInputChange("phone", "")
      handleInputChange("easenetTag", "")
      setEasenetResolved(null)
      setEasenetLookupError(null)
      return
    }
    if (type === "mobile") {
      const firstCountry = mobileCountriesFlat[0]
      handleInputChange("recipientType", "mobile")
      if (!firstCountry) {
        handleInputChange("country", "")
        handleInputChange("mobileProvider", "")
      } else {
        const firstRow = mobileCorridors.find(
          (c) => c.country_code === firstCountry.code && c.currency_code === firstCountry.currency,
        )
        const firstProvider =
          Array.isArray(firstRow?.providers) && firstRow.providers.length
            ? (firstRow.providers as string[])[0]
            : (mobileMoneyProvidersByCurrency[firstCountry.currency] || ["Other"])[0]
        handleInputChange("country", firstCountry.name)
        handleInputChange("mobileProvider", firstProvider)
      }
      handleInputChange("easenetTag", "")
      setEasenetResolved(null)
      setEasenetLookupError(null)
      return
    }
    const firstAsset = Object.keys(WALLET_ASSET_NETWORKS)[0] || DEFAULT_WALLET_ASSET
    const firstNetwork = (WALLET_ASSET_NETWORKS[firstAsset] || [])[0] || ""
    handleInputChange("recipientType", "wallet")
    handleInputChange("walletAsset", firstAsset)
    handleInputChange("walletNetwork", firstNetwork)
    handleInputChange("easenetTag", "")
    setEasenetResolved(null)
    setEasenetLookupError(null)
  }

  useEffect(() => {
    if (!allowedRecipientTypes?.length) return
    const allow = new Set(allowedRecipientTypes)
    if (allow.has(formData.recipientType)) return
    const first = recipientTypeTabs[0]?.id ?? "bank"
    selectRecipientType(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectRecipientType not stable; clamp only on allow/type
  }, [allowedRecipientTypes, formData.recipientType, recipientTypeTabs])

  const recipientTypeIndex = Math.max(
    0,
    recipientTypeTabs.findIndex((t) => t.id === formData.recipientType),
  )

  return (
    <form id={formId} onSubmit={handleSubmit} className="min-w-0 space-y-6">
      {recipientTypeTabs.length > 1 ? (
        <div className="space-y-2 max-w-3xl">
          <label className="text-sm font-medium">
            {terminology === "payroll" ? "Receiving method" : "Recipient Type"}
          </label>
          <div className="relative flex rounded-xl border border-input bg-muted/45 p-1 shadow-inner">
            <div
              aria-hidden
              className="pointer-events-none absolute top-1 bottom-1 left-1 rounded-lg bg-background shadow-sm ring-1 ring-border/60 motion-safe:transition-[transform] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{
                width: `calc((100% - 0.5rem) / ${recipientTabCount})`,
                transform: `translateX(calc(${recipientTypeIndex} * 100%))`,
              }}
            />
            {recipientTypeTabs.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant="ghost"
                className={cn(
                  "relative z-10 h-10 flex-1 shrink-0 rounded-lg border-0 px-2 text-xs font-medium shadow-none sm:text-sm motion-safe:transition-colors motion-safe:duration-200",
                  formData.recipientType === t.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-transparent hover:text-foreground",
                )}
                onClick={() => selectRecipientType(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        key={formData.recipientType}
        className="space-y-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out"
      >
        <div className="grid min-w-0 grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {formData.recipientType === "easenet" && (
            <div className="space-y-4 md:col-span-2">
              <div className="space-y-2">
                <Label htmlFor="easenetTag">Easetag</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                  <Input
                    id="easenetTag"
                    value={formData.easenetTag}
                    onChange={(e) => handleInputChange("easenetTag", e.target.value.replace(/^@+/, ""))}
                    placeholder="handle"
                    className={`h-12 pl-8 ${errors.easenetTag ? "border-red-500" : ""}`}
                    autoComplete="off"
                  />
                  {easenetLookupLoading ? (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
                {errors.easenetTag ? (
                  <p className="text-xs text-red-500">{errors.easenetTag}</p>
                ) : easenetLookupError ? (
                  <p className="text-xs text-red-500">{easenetLookupError}</p>
                ) : null}
              </div>
              {easenetResolved ? (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-4">
                  <EasenetRecipientProfileRow
                    fullName={easenetResolved.fullName}
                    easetag={easenetResolved.easetag}
                    accountKind={easenetResolved.accountKind}
                    avatarUrl={easenetResolved.avatarUrl}
                  />
                </div>
              ) : null}
            </div>
          )}

          {formData.recipientType === "bank" && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                {terminology === "payroll" ? "Account holder name" : "Recipient Name"}
              </label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="John Doe"
                className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 capitalize ${errors.name ? "border-red-500" : ""}`}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>
          )}

          {(formData.recipientType === "bank" || formData.recipientType === "mobile") && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Country
                </label>
                <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className={`flex h-12 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50 transition-[border-color] ${errors.country ? "border-red-500" : ""}`}
                    >
                      {selectedCountry ? (
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <CountryFlag code={selectedCountry.code} size={22} />
                          <span className="truncate text-xs sm:text-sm">
                            {`${selectedCountry.name} · ${selectedCountry.currency}`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {payoutCorridorsLoading ? "Loading corridors…" : "Select country"}
                        </span>
                      )}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0 z-[60]"
                    align="start"
                    side="bottom"
                    sideOffset={4}
                  >
                    <Command>
                      <CommandInput className="placeholder:text-xs" placeholder="Search country or currency..." />
                      <CommandList
                        className={DYNAMIC_COMBOBOX_LIST_CLASS}
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                      >
                        <CommandEmpty>
                          {payoutCorridorsLoading
                            ? "Loading payout corridors…"
                            : terminology === "payroll"
                              ? "This receiving method is not available here yet. Try again later or contact support."
                              : "No payout corridors for this recipient type. Try again later or contact support."}
                        </CommandEmpty>
                        <CommandGroup>
                          {countryOptions.map((country) => (
                            <CommandItem
                              key={`${country.code}-${country.currency}-${country.name}`}
                              value={`${country.currency} ${country.name} ${country.code}`}
                              onSelect={() => {
                                handleInputChange("country", country.name)
                                if (formData.recipientType === "bank") {
                                  handleInputChange("bankName", "")
                                  handleInputChange("email", "")
                                }
                                if (formData.recipientType === "mobile") {
                                  const row = mobileCorridors.find(
                                    (c) => c.country_code === country.code && c.currency_code === country.currency,
                                  )
                                  const firstProvider =
                                    Array.isArray(row?.providers) && row!.providers!.length
                                      ? (row!.providers as string[])[0]
                                      : (mobileMoneyProvidersByCurrency[country.currency] || ["Other"])[0]
                                  handleInputChange("mobileProvider", firstProvider)
                                }
                                setCountryOpen(false)
                              }}
                            >
                              <div className="flex items-center gap-2 w-full min-w-0">
                                <CountryFlag code={country.code} size={22} />
                                <span className="flex-1 min-w-0 truncate text-xs sm:text-sm">
                                  {`${country.name} · ${country.currency}`}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {errors.country && <p className="text-xs text-red-500">{errors.country}</p>}
              </div>

              {formData.recipientType === "mobile" && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Provider</label>
                    <Popover open={mobileProviderOpen} onOpenChange={setMobileProviderOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={`h-12 w-full justify-between ${errors.mobileProvider ? "border-red-500" : ""}`}
                          type="button"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {formData.mobileProvider ? (
                              <>
                                <MobileMoneyProviderIcon provider={formData.mobileProvider} size={18} />
                                <span className="truncate">{formData.mobileProvider}</span>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">Select provider</span>
                            )}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0 z-[60]"
                        align="start"
                        side="bottom"
                        sideOffset={4}
                      >
                        <Command>
                          <CommandInput className="placeholder:text-xs" placeholder="Search providers..." />
                          <CommandList
                            className={DYNAMIC_COMBOBOX_LIST_CLASS}
                            onWheel={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                          >
                            <CommandEmpty>
                              {mobileProviderChoices.length === 0
                                ? "No mobile networks for this corridor. Sync schemas or enable the corridor in Platform Control."
                                : "No providers found."}
                            </CommandEmpty>
                            <CommandGroup>
                              {mobileProviderChoices.map((provider) => (
                                <CommandItem
                                  key={provider}
                                  value={provider}
                                  onSelect={() => {
                                    handleInputChange("mobileProvider", provider)
                                    setMobileProviderOpen(false)
                                  }}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <MobileMoneyProviderIcon provider={provider} size={18} />
                                    <span>{provider}</span>
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {errors.mobileProvider && <p className="text-xs text-red-500">{errors.mobileProvider}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Recipient Name
                    </label>
                    <Input
                      id="name-mobile"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      placeholder="John Doe"
                      className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 capitalize ${errors.name ? "border-red-500" : ""}`}
                    />
                    {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      Phone Number
                    </label>
                    <Input
                      id="phone-mobile"
                      value={formData.phone}
                      onChange={(e) => handleInputChange("phone", e.target.value)}
                      placeholder="+2348012345678"
                      className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.phone ? "border-red-500" : ""}`}
                    />
                    {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="space-y-6 border-t border-border/60 pt-6 md:border-0 md:pt-0">
          {formData.recipientType === "bank" && (
            <div className="flex items-center gap-2 text-sm font-medium">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              Account Details
            </div>
          )}

          {formData.recipientType === "wallet" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs text-muted-foreground">Address nickname</label>
                <Input
                  id="name-wallet"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Binance Hot Wallet"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.name ? "border-red-500" : ""}`}
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs text-muted-foreground">Wallet Address</label>
                <Input
                  value={formData.walletAddress}
                  onChange={(e) => handleInputChange("walletAddress", e.target.value)}
                  placeholder={terminology === "payroll" ? "Wallet address" : "Recipient wallet address"}
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.walletAddress ? "border-red-500" : ""}`}
                />
                {errors.walletAddress && <p className="text-xs text-red-500">{errors.walletAddress}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Asset</label>
                <Popover open={walletAssetOpen} onOpenChange={setWalletAssetOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`h-12 w-full justify-between ${errors.walletAsset ? "border-red-500" : ""}`}
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        {getTokenIconUrl(formData.walletAsset) && (
                          <img
                            src={getTokenIconUrl(formData.walletAsset)}
                            alt={formData.walletAsset}
                            className="h-[18px] w-[18px] rounded-full object-cover"
                          />
                        )}
                        <span className={formData.walletAsset ? "" : "text-xs text-muted-foreground"}>
                          {formData.walletAsset || "Select asset"}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput className="placeholder:text-xs" placeholder="Search asset..." />
                      <CommandList className={DYNAMIC_COMBOBOX_LIST_CLASS}>
                        <CommandEmpty>No asset found.</CommandEmpty>
                        <CommandGroup>
                          {Object.keys(walletAssetNetworks).map((asset) => (
                            <CommandItem
                              key={asset}
                              value={asset}
                              onSelect={() => {
                                const networks = walletAssetNetworks[asset] || []
                                handleInputChange("walletAsset", asset)
                                handleInputChange("walletNetwork", networks[0] || "")
                                setWalletAssetOpen(false)
                              }}
                            >
                              <span className="flex items-center gap-2">
                                {getTokenIconUrl(asset) && (
                                  <img
                                    src={getTokenIconUrl(asset)}
                                    alt={asset}
                                    className="h-[18px] w-[18px] rounded-full object-cover"
                                  />
                                )}
                                {asset}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {errors.walletAsset && <p className="text-xs text-red-500">{errors.walletAsset}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Network</label>
                <Popover open={walletNetworkOpen} onOpenChange={setWalletNetworkOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`h-12 w-full justify-between ${errors.walletNetwork ? "border-red-500" : ""}`}
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        {getNetworkIconUrl(formData.walletNetwork) && (
                          <img
                            src={getNetworkIconUrl(formData.walletNetwork)}
                            alt={formData.walletNetwork}
                            className="h-[18px] w-[18px] rounded-full object-cover"
                          />
                        )}
                        <span className={formData.walletNetwork ? "" : "text-xs text-muted-foreground"}>
                          {formData.walletNetwork || "Select network"}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput className="placeholder:text-xs" placeholder="Search network..." />
                      <CommandList className={DYNAMIC_COMBOBOX_LIST_CLASS}>
                        <CommandEmpty>No network found.</CommandEmpty>
                        <CommandGroup>
                          {(walletAssetNetworks[formData.walletAsset] || []).map((network) => (
                            <CommandItem
                              key={network}
                              value={network}
                              onSelect={() => {
                                handleInputChange("walletNetwork", network)
                                setWalletNetworkOpen(false)
                              }}
                            >
                              <span className="flex items-center gap-2">
                                {getNetworkIconUrl(network) && (
                                  <img
                                    src={getNetworkIconUrl(network)}
                                    alt={network}
                                    className="h-[18px] w-[18px] rounded-full object-cover"
                                  />
                                )}
                                {network}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {errors.walletNetwork && <p className="text-xs text-red-500">{errors.walletNetwork}</p>}
              </div>
            </div>
          )}

          {formData.recipientType === "bank" && currency === "USD" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <label className="text-xs text-muted-foreground">Transfer type</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={formData.transferType === "ACH" ? "default" : "outline"}
                    onClick={() => handleInputChange("transferType", "ACH")}
                  >
                    ACH
                  </Button>
                  <Button
                    type="button"
                    variant={formData.transferType === "Wire" ? "default" : "outline"}
                    onClick={() => handleInputChange("transferType", "Wire")}
                  >
                    Fedwire
                  </Button>
                </div>
                {errors.transferType && <p className="text-xs text-red-500">{errors.transferType}</p>}
              </div>
              {formData.transferType !== "Wire" ? (
                <div className="space-y-2 col-span-2">
                  <label className="text-xs text-muted-foreground">Account Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={formData.checkingOrSavings === "checking" ? "default" : "outline"}
                      onClick={() => handleInputChange("checkingOrSavings", "checking")}
                    >
                      Checking
                    </Button>
                    <Button
                      type="button"
                      variant={formData.checkingOrSavings === "savings" ? "default" : "outline"}
                      onClick={() => handleInputChange("checkingOrSavings", "savings")}
                    >
                      Savings
                    </Button>
                  </div>
                  {errors.checkingOrSavings && <p className="text-xs text-red-500">{errors.checkingOrSavings}</p>}
                </div>
              ) : null}
              <div className="space-y-2 col-span-2">
                <label className="text-xs text-muted-foreground">Street address</label>
                <Input
                  value={formData.addressLine1}
                  onChange={(e) => handleInputChange("addressLine1", e.target.value)}
                  placeholder="123 Main St"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.addressLine1 ? "border-red-500" : ""}`}
                  required
                />
                {errors.addressLine1 && <p className="text-xs text-red-500">{errors.addressLine1}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">City</label>
                <Input
                  value={formData.city}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  placeholder="New York"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.city ? "border-red-500" : ""}`}
                  required
                />
                {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">State</label>
                <Input
                  value={formData.state}
                  onChange={(e) => handleInputChange("state", e.target.value)}
                  placeholder="NY"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.state ? "border-red-500" : ""}`}
                  required
                />
                {errors.state && <p className="text-xs text-red-500">{errors.state}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">ZIP code</label>
                <Input
                  value={formData.postalCode}
                  onChange={(e) => handleInputChange("postalCode", e.target.value)}
                  placeholder="10001"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.postalCode ? "border-red-500" : ""}`}
                  required
                />
                {errors.postalCode && <p className="text-xs text-red-500">{errors.postalCode}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Routing Number</label>
                <Input
                  value={formData.routingNumber || ""}
                  onChange={(e) => handleInputChange("routingNumber", e.target.value)}
                  placeholder="121000248"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.routingNumber ? "border-red-500" : ""}`}
                  required
                />
                {errors.routingNumber && <p className="text-xs text-red-500">{errors.routingNumber}</p>}
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-xs text-muted-foreground">Account Number</label>
                <Input
                  value={formData.accountNumber}
                  onChange={(e) => handleInputChange("accountNumber", e.target.value)}
                  placeholder="1234567890"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 normal-case ${errors.accountNumber ? "border-red-500" : ""}`}
                  required
                />
                {errors.accountNumber && <p className="text-xs text-red-500">{errors.accountNumber}</p>}
              </div>
            </div>
          )}

          {currency === "EUR" && (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <label className="text-xs text-muted-foreground">IBAN</label>
                <Input
                  value={formData.iban || ""}
                  onChange={(e) => handleInputChange("iban", e.target.value)}
                  placeholder="DE89370400440532013000"
                  className={`h-12 font-mono text-sm placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.iban ? "border-red-500" : ""}`}
                  required
                />
                {errors.iban && <p className="text-xs text-red-500">{errors.iban}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">BIC/SWIFT</label>
                <Input
                  value={formData.bic || ""}
                  onChange={(e) => handleInputChange("bic", e.target.value)}
                  placeholder="SOBKDEB2XXX"
                  className={`h-12 font-mono text-sm placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.bic ? "border-red-500" : ""}`}
                  required
                />
                {errors.bic && <p className="text-xs text-red-500">{errors.bic}</p>}
              </div>
            </div>
          )}

          {currency === "GBP" && (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Sort Code</label>
                <Input
                  value={formData.sortCode || ""}
                  onChange={(e) => handleInputChange("sortCode", e.target.value)}
                  placeholder="04-00-04"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.sortCode ? "border-red-500" : ""}`}
                  required
                />
                {errors.sortCode && <p className="text-xs text-red-500">{errors.sortCode}</p>}
              </div>
              <div className="space-y-2 col-span-3">
                <label className="text-xs text-muted-foreground">Account Number</label>
                <Input
                  value={formData.accountNumber}
                  onChange={(e) => handleInputChange("accountNumber", e.target.value)}
                  placeholder="12345678"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 normal-case ${errors.accountNumber ? "border-red-500" : ""}`}
                  required
                />
                {errors.accountNumber && <p className="text-xs text-red-500">{errors.accountNumber}</p>}
              </div>
            </div>
          )}

          {formData.recipientType === "bank" && currency === "CAD" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Branch code</label>
                <Input
                  value={formData.sortCode || ""}
                  onChange={(e) => handleInputChange("sortCode", e.target.value)}
                  placeholder="Branch code"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.sortCode ? "border-red-500" : ""}`}
                  required
                />
                {errors.sortCode && <p className="text-xs text-red-500">{errors.sortCode}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Routing number (CPA)</label>
                <Input
                  value={formData.routingNumber || ""}
                  onChange={(e) => handleInputChange("routingNumber", e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="9 digits (0 + institution + transit)"
                  className={`h-12 font-mono text-sm placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.routingNumber ? "border-red-500" : ""}`}
                  required
                  inputMode="numeric"
                />
                {errors.routingNumber && <p className="text-xs text-red-500">{errors.routingNumber}</p>}
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-xs text-muted-foreground">Account Number</label>
                <Input
                  value={formData.accountNumber}
                  onChange={(e) => handleInputChange("accountNumber", e.target.value)}
                  placeholder="Account number"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 normal-case ${errors.accountNumber ? "border-red-500" : ""}`}
                  required
                />
                {errors.accountNumber && <p className="text-xs text-red-500">{errors.accountNumber}</p>}
              </div>
            </div>
          )}

          {formData.recipientType === "bank" && !["USD", "EUR", "GBP", "CAD"].includes(currency) && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{getAccountIdentifierLabel(currency)}</label>
                <Input
                  value={formData.accountNumber}
                  onChange={(e) => handleInputChange("accountNumber", e.target.value)}
                  placeholder={ycCorridorSchema?.account_number_hint || "1234567890"}
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 normal-case ${errors.accountNumber ? "border-red-500" : ""}`}
                  required
                />
                {errors.accountNumber && <p className="text-xs text-red-500">{errors.accountNumber}</p>}
              </div>
              <YcRecipientExtraFields
                schema={ycCorridorSchema}
                values={ycMetadata}
                onChange={(patch) => setYcMetadata((prev) => ({ ...prev, ...patch }))}
                errors={errors}
                disabled={isSubmitting}
              />
              {recipientFormNeedsBankCode(payoutFormHints) ? (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">SWIFT/BIC</label>
                  <Input
                    value={formData.bic || ""}
                    onChange={(e) => handleInputChange("bic", e.target.value.toUpperCase())}
                    placeholder="CENAIDJA"
                    className={`h-12 font-mono text-sm placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.bic ? "border-red-500" : ""}`}
                    required
                  />
                  {errors.bic && <p className="text-xs text-red-500">{errors.bic}</p>}
                </div>
              ) : null}
            </div>
          )}

          {formData.recipientType === "bank" && (
            <div className="min-w-0 space-y-2 md:col-span-2">
              <label className="text-xs text-muted-foreground">Bank Name</label>
              {bankEnumOptions.length > 0 ? (
                <PayoutBankCombobox
                  banks={bankEnumOptions}
                  value={formData.bankName}
                  onChange={(v) => handleInputChange("bankName", v)}
                  error={Boolean(errors.bankName)}
                />
              ) : (
                <Input
                  value={formData.bankName}
                  onChange={(e) => handleInputChange("bankName", e.target.value)}
                  placeholder="Bank Name"
                  className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 capitalize ${errors.bankName ? "border-red-500" : ""}`}
                  required
                />
              )}
              {errors.bankName && <p className="text-xs text-red-500">{errors.bankName}</p>}
            </div>
          )}

          {formData.recipientType === "bank" &&
            recipientFormNeedsAddress({ hints: payoutFormHints, currencyCode: currency }) &&
            currency !== "USD" && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Street address</label>
                  <Input
                    value={formData.addressLine1}
                    onChange={(e) => handleInputChange("addressLine1", e.target.value)}
                    className={`h-12 ${errors.addressLine1 ? "border-red-500" : ""}`}
                    required
                  />
                  {errors.addressLine1 && <p className="text-xs text-red-500">{errors.addressLine1}</p>}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">City</label>
                    <Input
                      value={formData.city}
                      onChange={(e) => handleInputChange("city", e.target.value)}
                      className={`h-12 ${errors.city ? "border-red-500" : ""}`}
                      required
                    />
                    {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">State / region</label>
                    <Input
                      value={formData.state}
                      onChange={(e) => handleInputChange("state", e.target.value)}
                      className={`h-12 ${errors.state ? "border-red-500" : ""}`}
                      required
                    />
                    {errors.state && <p className="text-xs text-red-500">{errors.state}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Postal code</label>
                    <Input
                      value={formData.postalCode}
                      onChange={(e) => handleInputChange("postalCode", e.target.value)}
                      className={`h-12 ${errors.postalCode ? "border-red-500" : ""}`}
                      required
                    />
                    {errors.postalCode && <p className="text-xs text-red-500">{errors.postalCode}</p>}
                  </div>
                </div>
              </>
            )}

          {formData.recipientType === "bank" && payoutFormHints?.needs_phone && currency !== "USD" && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Phone number</label>
              <Input
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                placeholder="+254…"
                className={`h-12 ${errors.phone ? "border-red-500" : ""}`}
              />
              {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
            </div>
          )}

          {formData.recipientType === "bank" && recipientFormNeedsEmail(payoutFormHints) && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Email</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="beneficiary@example.com"
                className={`h-12 ${errors.email ? "border-red-500" : ""}`}
                autoComplete="email"
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
          )}
        </div>
      </div>

      {!hideSubmitButton ? (
        <div className="flex justify-end gap-3">
          <Button type="submit" className="gap-2" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSubmitting
              ? "Saving..."
              : isEdit
                ? terminology === "payroll"
                  ? "Update receiving method"
                  : "Update Recipient"
                : (submitButtonLabel ?? "Save Recipient")}
          </Button>
        </div>
      ) : null}
    </form>
  )
}
