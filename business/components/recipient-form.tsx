"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Loader2, User, Mail, Phone, CreditCard, MapPin, ChevronDown } from "lucide-react"
import type { Beneficiary } from "@/lib/recipient-types"
import { CountryFlag } from "@/components/flags"
import { getNetworkIconUrl, getTokenIconUrl } from "@/lib/crypto-icons"
import { createRecipient, updateRecipient, type RecipientUpsertInput } from "@/lib/recipients-store"

interface RecipientFormProps {
  recipient?: any
  onSuccess: () => void
  isEdit?: boolean
  /** When provided and in add mode, called with the new beneficiary before onSuccess */
  onSuccessWithData?: (beneficiary: Beneficiary) => void
}

const countries = [
  { name: "United States", currency: "USD", code: "US" },
  { name: "Argentina", currency: "ARS", code: "AR" },
  { name: "Australia", currency: "AUD", code: "AU" },
  { name: "Austria", currency: "EUR", code: "AT" },
  { name: "Belgium", currency: "EUR", code: "BE" },
  { name: "Benin", currency: "XOF", code: "BJ" },
  { name: "Brazil", currency: "BRL", code: "BR" },
  { name: "Switzerland", currency: "CHF", code: "CH" },
  { name: "Chile", currency: "CLP", code: "CL" },
  { name: "Colombia", currency: "COP", code: "CO" },
  { name: "Republic of the Congo", currency: "XAF", code: "CG" },
  { name: "Cote D'Ivoire", currency: "XOF", code: "CI" },
  { name: "Croatia", currency: "EUR", code: "HR" },
  { name: "Czech Republic", currency: "CZK", code: "CZ" },
  { name: "Denmark", currency: "DKK", code: "DK" },
  { name: "Dominican Republic", currency: "DOP", code: "DO" },
  { name: "Ecuador", currency: "USD", code: "EC" },
  { name: "Estonia", currency: "EUR", code: "EE" },
  { name: "Ethiopia", currency: "ETB", code: "ET" },
  { name: "Finland", currency: "EUR", code: "FI" },
  { name: "Fiji", currency: "FJD", code: "FJ" },
  { name: "France", currency: "EUR", code: "FR" },
  { name: "Gabon", currency: "XAF", code: "GA" },
  { name: "Germany", currency: "EUR", code: "DE" },
  { name: "Ghana", currency: "GHS", code: "GH" },
  { name: "Greece", currency: "EUR", code: "GR" },
  { name: "Hong Kong", currency: "HKD", code: "HK" },
  { name: "India", currency: "INR", code: "IN" },
  { name: "Indonesia", currency: "IDR", code: "ID" },
  { name: "Ireland", currency: "EUR", code: "IE" },
  { name: "Italy", currency: "EUR", code: "IT" },
  { name: "Latvia", currency: "EUR", code: "LV" },
  { name: "Lithuania", currency: "EUR", code: "LT" },
  { name: "Luxembourg", currency: "EUR", code: "LU" },
  { name: "Malawi", currency: "MWK", code: "MW" },
  { name: "Malaysia", currency: "MYR", code: "MY" },
  { name: "Mexico", currency: "MXN", code: "MX" },
  { name: "Netherlands", currency: "EUR", code: "NL" },
  { name: "New Zealand", currency: "NZD", code: "NZ" },
  { name: "Nigeria", currency: "NGN", code: "NG" },
  { name: "Philippines", currency: "PHP", code: "PH" },
  { name: "Poland", currency: "PLN", code: "PL" },
  { name: "Portugal", currency: "EUR", code: "PT" },
  { name: "Paraguay", currency: "PYG", code: "PY" },
  { name: "Romania", currency: "RON", code: "RO" },
  { name: "Rwanda", currency: "RWF", code: "RW" },
  { name: "Singapore", currency: "SGD", code: "SG" },
  { name: "Sierra Leone", currency: "SLL", code: "SL" },
  { name: "Slovakia", currency: "EUR", code: "SK" },
  { name: "Slovenia", currency: "EUR", code: "SI" },
  { name: "South Korea", currency: "KRW", code: "KR" },
  { name: "Spain", currency: "EUR", code: "ES" },
  { name: "Sweden", currency: "SEK", code: "SE" },
  { name: "Thailand", currency: "THB", code: "TH" },
  { name: "Turkey", currency: "TRY", code: "TR" },
  { name: "United Arab Emirates", currency: "AED", code: "AE" },
  { name: "United Kingdom", currency: "GBP", code: "GB" },
  { name: "Uganda", currency: "UGX", code: "UG" },
  { name: "Uruguay", currency: "UYU", code: "UY" },
  { name: "Vanuatu", currency: "VUV", code: "VU" },
]

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

const mobileMoneyCountries = [
  { name: "Benin", currency: "XOF", code: "BJ" },
  { name: "Botswana", currency: "BWP", code: "BW" },
  { name: "Cameroon", currency: "XAF", code: "CM" },
  { name: "Ivory Coast", currency: "XOF", code: "CI" },
  { name: "Kenya", currency: "KES", code: "KE" },
  { name: "Malawi", currency: "MWK", code: "MW" },
  { name: "Rwanda", currency: "RWF", code: "RW" },
  { name: "Senegal", currency: "XOF", code: "SN" },
  { name: "Tanzania", currency: "TZS", code: "TZ" },
  { name: "Togo", currency: "XOF", code: "TG" },
  { name: "Uganda", currency: "UGX", code: "UG" },
  { name: "Zambia", currency: "ZMW", code: "ZM" },
  { name: "Burkina Faso", currency: "XOF", code: "BF" },
  { name: "Gabon", currency: "XAF", code: "GA" },
  { name: "Mali", currency: "XOF", code: "ML" },
  { name: "Philippines", currency: "PHP", code: "PH" },
  { name: "Indonesia", currency: "IDR", code: "ID" },
  { name: "India", currency: "INR", code: "IN" },
]

export function RecipientForm({ recipient, onSuccess, isEdit = false, onSuccessWithData }: RecipientFormProps) {
  const [formData, setFormData] = useState({
    recipientType: "bank",
    name: "",
    bankName: "",
    accountNumber: "",
    routingNumber: "",
    iban: "",
    bic: "",
    sortCode: "",
    country: "United States",
    email: "",
    phone: "",
    walletAsset: "USDT",
    walletNetwork: "",
    walletAddress: "",
    walletMemoTag: "",
    mobileProvider: "",
    transferType: "ACH",
    checkingOrSavings: "",
    addressLine1: "",
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [countryOpen, setCountryOpen] = useState(false)
  const [walletAssetOpen, setWalletAssetOpen] = useState(false)
  const [walletNetworkOpen, setWalletNetworkOpen] = useState(false)
  const [mobileProviderOpen, setMobileProviderOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resolveCountryByRecipient = (r: Beneficiary) => {
    const options = (r.bankName?.toLowerCase().includes("mobile money") ? mobileMoneyCountries : countries)
    const byName = options.find((c) => c.name.toLowerCase() === String(r.country || "").toLowerCase())
    if (byName) return byName
    const byCurrency = options.find((c) => c.currency === r.currency)
    return byCurrency || options[0]
  }

  useEffect(() => {
    if (recipient && isEdit) {
      const walletMatch = recipient.bankName?.match(/^Wallet \((.*)\)$/i)
      const mobileMatch = recipient.bankName?.match(/^Mobile Money \((.*)\)$/i)
      const descriptor = walletMatch?.[1] || ""
      const [parsedWalletAsset, parsedWalletNetwork] = descriptor.includes("/")
        ? descriptor.split("/")
        : [recipient.currency || "USDT", descriptor || ""]
      const matchedCountryFromCode = [...countries, ...mobileMoneyCountries].find(
        (c) => c.code === (recipient as Beneficiary).countryCode,
      )
      const matchedCountry = matchedCountryFromCode || resolveCountryByRecipient(recipient as Beneficiary)
      setFormData({
        name: recipient.name || "",
        recipientType: recipient.bankName?.toLowerCase().includes("wallet")
          ? "wallet"
          : recipient.bankName?.toLowerCase().includes("mobile money")
            ? "mobile"
            : "bank",
        bankName: recipient.bankName || "",
        accountNumber: recipient.fullAccountNumber || recipient.accountNumber || "",
        routingNumber: recipient.routingNumber || "",
        iban: recipient.iban || "",
        bic: recipient.bic || "",
        sortCode: recipient.sortCode || "",
        country: matchedCountry?.name || recipient.country || "United States",
        email: recipient.email || "",
        phone: recipient.phone || "",
        walletAsset: recipient.walletAsset || parsedWalletAsset || recipient.currency || "USDT",
        walletNetwork: recipient.walletNetwork || parsedWalletNetwork || "",
        walletAddress: recipient.fullAccountNumber || recipient.accountNumber || "",
        walletMemoTag: recipient.walletMemoTag || "",
        mobileProvider: recipient.mobileProvider || mobileMatch?.[1] || "",
        transferType: recipient.transferType || "ACH",
        checkingOrSavings: recipient.checkingOrSavings || "",
        addressLine1: recipient.addressLine1 || "",
      })
    }
  }, [recipient, isEdit])

  const countryOptions = formData.recipientType === "mobile" ? mobileMoneyCountries : countries
  const selectedCountry = countryOptions.find((c) => c.name === formData.country)
  const currency = selectedCountry?.currency || "USD"

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

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

    if (formData.recipientType === "bank" && !formData.email.trim()) {
      newErrors.email = "Email is required"
    } else if (formData.recipientType === "bank" && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email"
    }

    if (formData.recipientType === "bank" && !formData.phone.trim()) {
      newErrors.phone = "Phone number is required"
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

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!validateForm()) return

    const selectedCountry = [...countries, ...mobileMoneyCountries].find((c) => c.name === formData.country)
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
      phoneNumber: formData.phone.trim() || undefined,
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

  const selectRecipientType = (type: "bank" | "mobile" | "wallet") => {
    if (type === "bank") {
      handleInputChange("recipientType", "bank")
      handleInputChange("country", "United States")
      handleInputChange("mobileProvider", "")
      return
    }
    if (type === "mobile") {
      const firstCountry = mobileMoneyCountries[0]
      const firstProvider = (mobileMoneyProvidersByCurrency[firstCountry.currency] || ["Other"])[0]
      handleInputChange("recipientType", "mobile")
      handleInputChange("country", firstCountry.name)
      handleInputChange("mobileProvider", firstProvider)
      return
    }
    const firstAsset = Object.keys(walletAssetNetworks)[0] || "USDT"
    const firstNetwork = (walletAssetNetworks[firstAsset] || [])[0] || ""
    handleInputChange("recipientType", "wallet")
    handleInputChange("walletAsset", firstAsset)
    handleInputChange("walletNetwork", firstNetwork)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium">Recipient Type</label>
          <div className="grid grid-cols-3 gap-2 max-w-xl">
            <Button type="button" variant={formData.recipientType === "bank" ? "default" : "outline"} onClick={() => selectRecipientType("bank")}>Bank Account</Button>
            <Button type="button" variant={formData.recipientType === "mobile" ? "default" : "outline"} onClick={() => selectRecipientType("mobile")}>Mobile Money</Button>
            <Button type="button" variant={formData.recipientType === "wallet" ? "default" : "outline"} onClick={() => selectRecipientType("wallet")}>Wallet Address</Button>
          </div>
        </div>
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
            {formData.recipientType === "bank" && (
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Email Address
          </label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange("email", e.target.value)}
            placeholder="john.doe@example.com"
            className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.email ? "border-red-500" : ""}`}
          />
          {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
        </div>
            )}

            {formData.recipientType === "bank" && (
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            Phone Number
          </label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => handleInputChange("phone", e.target.value)}
            placeholder="+1 555 123 4567"
            className={`h-12 placeholder:text-xs placeholder:text-muted-foreground/60 ${errors.phone ? "border-red-500" : ""}`}
          />
          {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
        </div>
            )}

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Country / Currency
          </label>
          <Popover open={countryOpen} onOpenChange={setCountryOpen}>
            <PopoverTrigger asChild>
              <button className={`flex h-12 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50 transition-[border-color] ${errors.country ? "border-red-500" : ""}`}>
                {selectedCountry ? (
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <CountryFlag code={selectedCountry.code} size={22} />
                    <span className="truncate text-xs sm:text-sm">{selectedCountry.currency} - {selectedCountry.name}</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Select country / currency</span>
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
                  <CommandEmpty>No country/currency found.</CommandEmpty>
                  <CommandGroup>
                        {countryOptions.map((country) => (
                      <CommandItem
                        key={country.name}
                        value={`${country.currency} ${country.name}`}
                        onSelect={() => {
                          handleInputChange("country", country.name)
                          if (formData.recipientType === "mobile") {
                            const firstProvider = (mobileMoneyProvidersByCurrency[country.currency] || ["Other"])[0]
                            handleInputChange("mobileProvider", firstProvider)
                          }
                          setCountryOpen(false)
                        }}
                      >
                        <div className="flex items-center gap-2 w-full min-w-0">
                          <CountryFlag code={country.code} size={22} />
                          <span className="flex-1 min-w-0 truncate text-xs sm:text-sm">{country.currency} - {country.name}</span>
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
                            {(mobileMoneyProvidersByCurrency[currency] || ["Other"]).map((provider) => (
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

      <div className="space-y-6">
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
              <label className="text-xs text-muted-foreground">Transfer Type</label>
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
                  Wire
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

        {formData.recipientType === "bank" && !["USD", "EUR", "GBP"].includes(currency) && (
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

      <div className="flex justify-end gap-3">
        <Button type="submit" className="gap-2" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSubmitting ? "Saving..." : isEdit ? "Update Recipient" : "Save Recipient"}
        </Button>
      </div>
    </form>
  )
}
