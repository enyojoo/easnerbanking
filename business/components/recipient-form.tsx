"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Loader2, User, Phone, CreditCard, MapPin, ChevronDown } from "lucide-react"
import { sortByEasnerCountryPickerOrder } from "@easner/shared"
import type { Beneficiary } from "@/lib/recipient-types"
import { CountryFlag } from "@/components/flags"
import { usePayoutCorridors } from "@/lib/use-payout-corridors"
import { getNetworkIconUrl, getTokenIconUrl } from "@/lib/crypto-icons"
import { createRecipient, updateRecipient, type RecipientUpsertInput } from "@/lib/recipients-store"
import { fetchEasenetProfileByTag } from "@/lib/easenet-profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const RECIPIENT_TYPE_TABS = [
  { id: "bank" as const, label: "Bank Account" },
  { id: "mobile" as const, label: "Mobile Money" },
  { id: "wallet" as const, label: "Wallet Address" },
  { id: "easenet" as const, label: "Easetag" },
]

type RailCountryOption = { name: string; currency: string; code: string }

interface RecipientFormProps {
  recipient?: any
  onSuccess: () => void
  isEdit?: boolean
  /** When provided and in add mode, called with the new beneficiary before onSuccess */
  onSuccessWithData?: (beneficiary: Beneficiary) => void
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

const walletAssetNetworks: Record<string, string[]> = {
  USDT: ["Base", "Bitcoin", "Celo", "Ethereum"],
  USDC: ["Base", "Bitcoin", "Celo", "Ethereum", "FlowEvm", "Gnosis", "Lightning"],
  EURC: ["Solana"],
  BTC: ["Bitcoin"],
  SOL: ["Solana"],
  PYUSD: ["Base", "Bitcoin"],
}

const mobileMoneyProvidersByCurrency: Record<string, string[]> = {
  BWP: ["MyZaka"],
  XOF: ["MTN", "Orange", "Moov Money", "Wave", "Free"],
  XAF: ["MTN", "Orange", "Moov Money"],
  KES: ["Airtel Money", "M-PESA"],
  MWK: ["Airtel Money", "TNM"],
  RWF: ["MTN"],
  TZS: ["Airtel Money", "TigoPesa"],
  UGX: ["Airtel Money", "MTN"],
  ZMW: ["Airtel Money", "MTN", "TNM"],
  PHP: ["GCash", "Maya"],
  IDR: ["DANA", "OVO", "GoPay"],
  INR: ["UPI"],
}

export function RecipientForm({ recipient, onSuccess, isEdit = false, onSuccessWithData }: RecipientFormProps) {
  const [formData, setFormData] = useState({
    recipientType: isEdit && recipient ? inferRecipientType(recipient as Beneficiary) : "bank",
    name: "",
    bankName: "",
    accountNumber: "",
    routingNumber: "",
    iban: "",
    bic: "",
    sortCode: "",
    country: "United States",
    phone: "",
    walletAsset: "USDT",
    walletNetwork: "",
    walletAddress: "",
    walletMemoTag: "",
    mobileProvider: "",
    transferType: "ACH",
    checkingOrSavings: "",
    addressLine1: "",
    easenetTag: "",
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [countryOpen, setCountryOpen] = useState(false)
  const [walletAssetOpen, setWalletAssetOpen] = useState(false)
  const [walletNetworkOpen, setWalletNetworkOpen] = useState(false)
  const [mobileProviderOpen, setMobileProviderOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [easenetResolved, setEasenetResolved] = useState<{
    easetag: string
    fullName: string
    avatarUrl: string | null
  } | null>(null)
  const [easenetLookupLoading, setEasenetLookupLoading] = useState(false)
  const [easenetLookupError, setEasenetLookupError] = useState<string | null>(null)

  const { corridors: bankCorridors, enabled: corridorCatalogEnabled, loading: bankCorridorsLoading } =
    usePayoutCorridors("bank_transfer")
  const { corridors: mobileCorridors, loading: mobileCorridorsLoading } = usePayoutCorridors("mobile_money")

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
      const walletMatch = recipient.bankName?.match(/^Wallet \((.*)\)$/i)
      const mobileMatch = recipient.bankName?.match(/^Mobile Money \((.*)\)$/i)
      const mobileInner = mobileMatch?.[1] || ""
      const normalizedMobileProvider = mobileInner.includes("|CC:")
        ? mobileInner.split("|CC:")[0]
        : mobileInner
      const descriptor = walletMatch?.[1] || ""
      const [parsedWalletAsset, parsedWalletNetwork] = descriptor.includes("/")
        ? descriptor.split("/")
        : [recipient.currency || "USDT", descriptor || ""]
      const inferredType = inferRecipientType(recipient as Beneficiary)
      const bene = recipient as Beneficiary
      if (inferredType === "easenet" && bene.payeeEasetag) {
        setEasenetResolved({
          easetag: bene.payeeEasetag,
          fullName: bene.name || bene.payeeEasetag,
          avatarUrl: bene.avatarUrl ?? null,
        })
        setEasenetLookupError(null)
      } else {
        setEasenetResolved(null)
        setEasenetLookupError(null)
      }
      const recipientCountryCode = (recipient as Beneficiary).countryCode
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
      const matchedCountryFromCodeInType = countryOptionsForType.find(
        (c) => c.code === recipientCountryCode,
      )
      const combinedAny = [...bankOpts, ...mobileOpts]
      const matchedCountryFromCodeAny = combinedAny.find((c) => c.code === recipientCountryCode)
      const matchedCountry =
        matchedCountryFromCodeInType ||
        matchedCountryFromCodeAny ||
        resolveCountryByRecipient(recipient as Beneficiary)
      setFormData({
        name: recipient.name || "",
        recipientType: inferredType,
        bankName: recipient.bankName || "",
        accountNumber: recipient.fullAccountNumber || recipient.accountNumber || "",
        routingNumber: recipient.routingNumber || "",
        iban: recipient.iban || "",
        bic: recipient.bic || "",
        sortCode: recipient.sortCode || "",
        country: matchedCountry?.name || recipient.country || "United States",
        phone:
          inferredType === "mobile" ? recipient.phone || (recipient.fullAccountNumber || recipient.accountNumber || "") : "",
        walletAsset: recipient.walletAsset || parsedWalletAsset || recipient.currency || "USDT",
        walletNetwork: recipient.walletNetwork || parsedWalletNetwork || "",
        walletAddress: recipient.fullAccountNumber || recipient.accountNumber || "",
        walletMemoTag: recipient.walletMemoTag || recipient.bic || "",
        mobileProvider: recipient.mobileProvider || normalizedMobileProvider || "",
        transferType: recipient.transferType || "ACH",
        checkingOrSavings: recipient.checkingOrSavings || "",
        addressLine1: recipient.addressLine1 || "",
        easenetTag: inferredType === "easenet" ? bene.payeeEasetag || bene.accountNumber || "" : "",
      })
    }
  }, [recipient, isEdit, corridorCatalogEnabled, bankCorridors, mobileCorridors])

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

  const bankFromApi = corridorCatalogEnabled && bankCorridors.length > 0
  const mobileFromApi = corridorCatalogEnabled && mobileCorridors.length > 0

  const bankCountriesFlat = useMemo(() => {
    const rows = bankCorridors.map((c) => ({
      name: c.country_name,
      currency: c.currency_code,
      code: c.country_code,
    }))
    return sortByEasnerCountryPickerOrder(rows, (r) => r.code, (r) => r.name, (r) => r.currency)
  }, [bankCorridors])

  const mobileCountriesFlat = useMemo(() => {
    const rows = mobileCorridors.map((c) => ({
      name: c.country_name,
      currency: c.currency_code,
      code: c.country_code,
    }))
    return sortByEasnerCountryPickerOrder(rows, (r) => r.code, (r) => r.name, (r) => r.currency)
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

  const mobileProviderChoices = useMemo(() => {
    if (formData.recipientType !== "mobile") return [] as string[]
    if (mobileFromApi && selectedCountry) {
      const row = mobileCorridors.find(
        (c) => c.country_code === selectedCountry.code && c.currency_code === selectedCountry.currency,
      )
      if (row && Array.isArray(row.providers)) return row.providers as string[]
    }
    return mobileMoneyProvidersByCurrency[currency] || ["Other"]
  }, [formData.recipientType, mobileFromApi, selectedCountry, mobileCorridors, currency])

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
    if (formData.recipientType === "bank" && currency === "USD" && !formData.checkingOrSavings.trim()) {
      newErrors.checkingOrSavings = "Account type is required for USD"
    }
    if (formData.recipientType === "bank" && currency === "USD" && !formData.addressLine1.trim()) {
      newErrors.addressLine1 = "Address is required for USD"
    }

    if (formData.recipientType === "bank" && currency === "EUR") {
      if (!formData.iban.trim()) {
        newErrors.iban = "IBAN is required for EUR"
      }
      if (!formData.bic.trim()) {
        newErrors.bic = "BIC/SWIFT is required for EUR"
      }
    }

    if (formData.recipientType === "bank" && currency === "GBP" && !formData.sortCode.trim()) {
      newErrors.sortCode = "Sort code is required for GBP"
    }

    if (formData.recipientType === "bank" && currency === "CAD" && !formData.routingNumber.trim()) {
      newErrors.routingNumber = "Routing number is required for CAD (CPA format)"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!validateForm()) return

    if (formData.recipientType === "easenet" && easenetResolved) {
      const payload: RecipientUpsertInput = {
        recipientType: "easenet",
        countryCode: "US",
        fullName: easenetResolved.fullName,
        accountNumber: easenetResolved.easetag,
        bankName: "",
        currency: "USD",
        payeeEasetag: easenetResolved.easetag,
        payeeAvatarUrl: easenetResolved.avatarUrl,
      }
      try {
        setIsSubmitting(true)
        const beneficiary = isEdit && recipient?.id
          ? await updateRecipient(recipient.id, payload)
          : await createRecipient(payload)
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
    const currency = formData.recipientType === "wallet" ? formData.walletAsset : (selectedCountry?.currency || "USD")
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
      bankName:
        formData.recipientType === "bank" ? formData.bankName.trim() : "",
      currency,
      phoneNumber: formData.recipientType === "mobile" ? formData.phone.trim() || undefined : undefined,
      mobileProvider: formData.recipientType === "mobile" ? formData.mobileProvider.trim() || undefined : undefined,
      walletAsset: formData.recipientType === "wallet" ? formData.walletAsset.trim() || undefined : undefined,
      walletNetwork: formData.recipientType === "wallet" ? formData.walletNetwork.trim() || undefined : undefined,
      walletMemoTag: formData.recipientType === "wallet" ? formData.walletMemoTag.trim() || undefined : undefined,
      routingNumber: formData.routingNumber?.trim() || undefined,
      sortCode: formData.sortCode?.trim() || undefined,
      iban: formData.iban?.trim() || undefined,
      swiftBic: formData.recipientType === "bank" ? formData.bic?.trim() || undefined : undefined,
      transferType: isUsdBank ? (formData.transferType as "ACH" | "Wire") : undefined,
      checkingOrSavings: isUsdBank ? (formData.checkingOrSavings as "checking" | "savings") : undefined,
      addressLine1: isUsdBank ? formData.addressLine1.trim() : undefined,
    }

    try {
      setIsSubmitting(true)
      const beneficiary = isEdit && recipient?.id
        ? await updateRecipient(recipient.id, payload)
        : await createRecipient(payload)
      onSuccessWithData?.(beneficiary)
      onSuccess()
    } catch (err) {
      console.error("Failed to save recipient:", err instanceof Error ? err.message : err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }))
    }
  }

  const getAccountIdentifierLabel = (currency: string) => {
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
        const firstProvider = Array.isArray(firstRow?.providers) && firstRow.providers.length
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
    const firstAsset = Object.keys(walletAssetNetworks)[0] || "USDT"
    const firstNetwork = (walletAssetNetworks[firstAsset] || [])[0] || ""
    handleInputChange("recipientType", "wallet")
    handleInputChange("walletAsset", firstAsset)
    handleInputChange("walletNetwork", firstNetwork)
    handleInputChange("easenetTag", "")
    setEasenetResolved(null)
    setEasenetLookupError(null)
  }

  const recipientTypeIndex = Math.max(
    0,
    RECIPIENT_TYPE_TABS.findIndex((t) => t.id === formData.recipientType),
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2 max-w-3xl">
        <label className="text-sm font-medium">Recipient Type</label>
        <div className="relative flex rounded-xl border border-input bg-muted/45 p-1 shadow-inner">
          <div
            aria-hidden
            className="pointer-events-none absolute top-1 bottom-1 left-1 rounded-lg bg-background shadow-sm ring-1 ring-border/60 motion-safe:transition-[transform] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{
              width: "calc((100% - 0.5rem) / 4)",
              transform: `translateX(calc(${recipientTypeIndex} * 100%))`,
            }}
          />
          {RECIPIENT_TYPE_TABS.map((t) => (
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

      <div
        key={formData.recipientType}
        className="space-y-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out"
      >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
              <Card>
                <CardContent className="flex items-center gap-4 pt-6">
                  <Avatar className="h-14 w-14">
                    <AvatarImage src={easenetResolved.avatarUrl || undefined} alt="" />
                    <AvatarFallback>
                      {easenetResolved.fullName
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((p) => p[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{easenetResolved.fullName}</p>
                    <p className="text-sm text-muted-foreground">@{easenetResolved.easetag}</p>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}

        {formData.recipientType === "bank" && (
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
              Recipient Name
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
              <button className={`flex h-12 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50 transition-[border-color] ${errors.country ? "border-red-500" : ""}`}>
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
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[60]" align="start" side="bottom" sideOffset={4}>
                  <Command className="max-h-[320px]">
                <CommandInput className="placeholder:text-xs" placeholder="Search country or currency..." />
                    <div
                      className="h-[260px] overflow-y-auto overscroll-contain"
                      onWheel={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                    >
                    <CommandList className="max-h-none">
                  <CommandEmpty>
                    {payoutCorridorsLoading
                      ? "Loading payout corridors…"
                      : "No payout corridors for this recipient type. Try again later or contact support."}
                  </CommandEmpty>
                  <CommandGroup>
                        {countryOptions.map((country) => (
                      <CommandItem
                        key={`${country.code}-${country.currency}-${country.name}`}
                        value={`${country.currency} ${country.name} ${country.code}`}
                        onSelect={() => {
                          handleInputChange("country", country.name)
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
                    </div>
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
                        <span className={formData.mobileProvider ? "" : "text-xs text-muted-foreground"}>
                          {formData.mobileProvider || "Select provider"}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                      <Command>
                        <CommandInput className="placeholder:text-xs" placeholder="Search providers..." />
                        <CommandList className="max-h-[260px] overflow-y-auto overscroll-contain">
                          <CommandEmpty>No providers found.</CommandEmpty>
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
                                {provider}
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
            <div className="space-y-2">
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
                        <img src={getTokenIconUrl(formData.walletAsset)} alt={formData.walletAsset} className="h-[18px] w-[18px] rounded-full object-cover" />
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
                    <CommandList className="max-h-[260px] overflow-y-auto overscroll-contain">
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
                              {getTokenIconUrl(asset) && <img src={getTokenIconUrl(asset)} alt={asset} className="h-[18px] w-[18px] rounded-full object-cover" />}
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
                        <img src={getNetworkIconUrl(formData.walletNetwork)} alt={formData.walletNetwork} className="h-[18px] w-[18px] rounded-full object-cover" />
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
                    <CommandList className="max-h-[260px] overflow-y-auto overscroll-contain">
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
                              {getNetworkIconUrl(network) && <img src={getNetworkIconUrl(network)} alt={network} className="h-[18px] w-[18px] rounded-full object-cover" />}
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
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Memo / Tag (optional)</label>
              <Input
                value={formData.walletMemoTag}
                onChange={(e) => handleInputChange("walletMemoTag", e.target.value)}
                placeholder="Destination tag or memo if required"
                className="h-12 placeholder:text-xs placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs text-muted-foreground">Wallet Address</label>
              <Input
                value={formData.walletAddress}
                onChange={(e) => handleInputChange("walletAddress", e.target.value)}
                placeholder="Recipient wallet address"
                className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.walletAddress ? "border-red-500" : ""}`}
              />
              {errors.walletAddress && <p className="text-xs text-red-500">{errors.walletAddress}</p>}
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
            <div className="space-y-2 col-span-2">
              <label className="text-xs text-muted-foreground">Address</label>
              <Input
                value={formData.addressLine1}
                onChange={(e) => handleInputChange("addressLine1", e.target.value)}
                placeholder="Address"
                className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.addressLine1 ? "border-red-500" : ""}`}
                required
              />
              {errors.addressLine1 && <p className="text-xs text-red-500">{errors.addressLine1}</p>}
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
            <div className="space-y-2">
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
            <div className="space-y-2 col-span-2">
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
            <div className="space-y-2">
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
          <div className="space-y-2">
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
        )}

        {formData.recipientType === "bank" && <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Bank Name</label>
          <Input
            value={formData.bankName}
            onChange={(e) => handleInputChange("bankName", e.target.value)}
            placeholder="Bank Name"
            className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 capitalize ${errors.bankName ? "border-red-500" : ""}`}
            required
          />
          {errors.bankName && <p className="text-xs text-red-500">{errors.bankName}</p>}
        </div>}
      </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="submit" className="gap-2" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSubmitting ? "Saving..." : isEdit ? "Update Recipient" : "Save Recipient"}
        </Button>
      </div>
    </form>
  )
}
