"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  Building2,
  Globe,
  FileText,
  MapPin,
  Edit,
  X,
  Check,
  ChevronDown,
  Info,
  Loader2,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BusinessLogoField } from "@/components/business-logo-field"
import { countries } from "@/lib/countries"
import { getKybFields } from "@/lib/kyb-by-country"
import {
  updateBusinessProfile,
  useBusinessProfile,
  type BusinessProfile,
} from "@/lib/use-business-profile"
import { CountryFlag } from "@/components/flags"
import { BusinessVerificationSection } from "@/components/compliance/business-verification-section"
import { BaseCurrencyOptionLabel } from "@/components/base-currency-option-label"
import { BusinessIndustryCombobox } from "@/components/settings/business-industry-combobox"
import { useBusinessEasetagAvailability } from "@/hooks/use-business-easetag-availability"
import { useAllowedBaseCurrencies } from "@/hooks/use-allowed-base-currencies"
import { useAllowedCountryCodes } from "@/hooks/use-allowed-country-codes"
import { filterCountriesByPolicy } from "@easner/shared"
import { SETTINGS_CONTROL_SURFACE } from "@/lib/settings-control-surface"

function getCountryFromCode(code: string) {
  return countries.find((c) => c.code === code)
}

/** Prefer API code; derive from stored country name so we never fall back to a guess like US. */
function countryCodeFromProfile(profile: Pick<BusinessProfile, "countryCode" | "country">): string {
  const fromApi = profile.countryCode?.trim().toUpperCase()
  if (fromApi && getCountryFromCode(fromApi)) return fromApi
  const stored = profile.country?.trim()
  if (stored) {
    if (/^[A-Za-z]{2}$/.test(stored)) {
      const iso = stored.toUpperCase()
      if (getCountryFromCode(iso)) return iso
    }
    const m = countries.find((c) => c.name.toLowerCase() === stored.toLowerCase())
    if (m) return m.code
  }
  return ""
}

type BusinessSettingsForm = {
  businessName: string
  easetag: string
  businessLogo: string | null
  businessType: string
  registrationNumber: string
  taxId: string
  website: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zipCode: string
  country: string
  baseCurrency: string
  description: string
}

export function SettingsBusinessTab() {
  const profile = useBusinessProfile()
  const loading = profile.isLoading
  const {
    currencies: baseCurrencies,
    loading: baseCurrenciesLoading,
    error: baseCurrenciesError,
  } = useAllowedBaseCurrencies()
  const kybCountryPolicy = useAllowedCountryCodes("kyb")
  const [countryCode, setCountryCode] = useState("")
  const [countryOpen, setCountryOpen] = useState(false)
  const countriesForKybPicker = useMemo(() => {
    const base = filterCountriesByPolicy(
      countries,
      kybCountryPolicy.unrestricted ? null : kybCountryPolicy.codes,
    )
    const cur = countries.find((c) => c.code === countryCode)
    if (cur && !base.some((b) => b.code === cur.code)) {
      return [cur, ...base]
    }
    return base
  }, [kybCountryPolicy.unrestricted, kybCountryPolicy.codes, countryCode])
  const easetagAvail = useBusinessEasetagAvailability({ profileEasetag: profile.easetag })
  const [editingSection, setEditingSection] = useState<string | null>(null)
  /** Which card section is currently persisting (Save); disables actions and shows spinner on that Save. */
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [formData, setFormData] = useState<BusinessSettingsForm>({
    businessName: "",
    easetag: "",
    businessLogo: null,
    businessType: "",
    registrationNumber: "",
    taxId: "",
    website: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
    baseCurrency: "USD",
    description: "",
  })

  useEffect(() => {
    if (profile.isLoading) return
    // Avoid overwriting Easetag (and racing the availability check) while editing business details.
    if (editingSection === "business") return
    const code = countryCodeFromProfile(profile)
    setCountryCode(code)
    const c = getCountryFromCode(code)
    const countryLabel = profile.country?.trim() || c?.name || ""
    setFormData((prev) => ({
      ...prev,
      businessName: profile.name || prev.businessName,
      easetag: profile.easetag || "",
      businessLogo: profile.logoUrl ?? prev.businessLogo,
      businessType: profile.businessType || prev.businessType,
      registrationNumber: profile.registrationNumber || prev.registrationNumber,
      taxId: profile.taxId || prev.taxId,
      baseCurrency: profile.baseCurrency || prev.baseCurrency,
      description: profile.description || prev.description,
      website: profile.website || prev.website,
      email: profile.supportEmail || prev.email,
      phone: profile.supportPhone || prev.phone,
      address: profile.addressLine1 || prev.address,
      city: profile.city || prev.city,
      state: profile.state || prev.state,
      zipCode: profile.postalCode || prev.zipCode,
      country: countryLabel,
    }))
  }, [
    profile.isLoading,
    profile.countryCode,
    profile.name,
    profile.easetag,
    profile.logoUrl,
    profile.businessType,
    profile.registrationNumber,
    profile.taxId,
    profile.baseCurrency,
    profile.description,
    profile.website,
    profile.supportEmail,
    profile.supportPhone,
    profile.addressLine1,
    profile.city,
    profile.state,
    profile.postalCode,
    profile.country,
    editingSection,
  ])

  const handleEasetagInput = (value: string) => {
    const clean = easetagAvail.processInput(value)
    handleInputChange("easetag", clean)
  }

  const handleEdit = (section: string) => {
    setEditingSection(section)
    if (section === "business") {
      easetagAvail.resetCheckState()
    }
  }
  const handleCancel = () => {
    easetagAvail.resetCheckState()
    setEditingSection(null)
  }
  const handleSave = async (section: string) => {
    setSavingSection(section)
    let updated: BusinessProfile | null = null

    try {
      if (section === "business") {
        easetagAvail.resetCheckState()
        updated = await updateBusinessProfile({
          businessName: formData.businessName,
          easetag: formData.easetag.trim() ? formData.easetag.trim().replace(/^@/, "").toLowerCase() : null,
          businessLogo: formData.businessLogo,
          businessType: formData.businessType,
          registrationNumber: formData.registrationNumber,
          taxId: formData.taxId,
          baseCurrency: formData.baseCurrency,
          businessDescription: formData.description,
        })
      } else if (section === "legal") {
        updated = await updateBusinessProfile({
          ...(countryCode.trim() ? { countryCode } : {}),
          registrationNumber: formData.registrationNumber,
          taxId: formData.taxId,
        })
      } else if (section === "address") {
        updated = await updateBusinessProfile({
          addressLine1: formData.address,
          city: formData.city,
          state: formData.state,
          postalCode: formData.zipCode,
        })
      } else if (section === "public") {
        updated = await updateBusinessProfile({
          website: formData.website,
          supportEmail: formData.email,
          supportPhone: formData.phone,
        })
      }
    } finally {
      setSavingSection(null)
    }

    if (!updated) return

    const p = updated
    const nextCountryCode = countryCodeFromProfile(p)
    setCountryCode(nextCountryCode)
    const countryRow = getCountryFromCode(nextCountryCode)
    setFormData((prev) => ({
      ...prev,
      businessName: p.name || prev.businessName,
      easetag: p.easetag || "",
      businessLogo: p.logoUrl ?? prev.businessLogo,
      businessType: p.businessType || prev.businessType,
      registrationNumber: p.registrationNumber || prev.registrationNumber,
      taxId: p.taxId || prev.taxId,
      baseCurrency: p.baseCurrency || prev.baseCurrency,
      description: p.description || prev.description,
      website: p.website || prev.website,
      email: p.supportEmail || prev.email,
      phone: p.supportPhone || prev.phone,
      address: p.addressLine1 || prev.address,
      city: p.city || prev.city,
      state: p.state || prev.state,
      zipCode: p.postalCode || prev.zipCode,
      country: p.country?.trim() || countryRow?.name || prev.country,
    }))
    setEditingSection(null)
  }
  const handleInputChange = <K extends keyof BusinessSettingsForm>(field: K, value: BusinessSettingsForm[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleCountryChange = (code: string) => {
    setCountryCode(code)
    const c = getCountryFromCode(code)
    if (c) handleInputChange("country", c.name)
    setCountryOpen(false)
  }

  const selectedCountry = getCountryFromCode(countryCode)
  const kybFields = getKybFields(countryCode)
  const easetagDraftLen = formData.easetag.replace(/^@/, "").trim().length

  return (
    <div className="space-y-6">
      <BusinessVerificationSection />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Business Information
            </CardTitle>
            {loading ? (
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            ) : editingSection === "business" ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={Boolean(savingSection)}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSave("business")} disabled={Boolean(savingSection)}>
                  {savingSection === "business" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  Save
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => handleEdit("business")}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto] md:items-start">
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-20 w-[min(100%,10rem)] animate-pulse rounded-md bg-muted md:w-36 md:justify-self-end" />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-28 w-full animate-pulse rounded-md bg-muted" />
            </div>
          ) : (
          <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto] md:items-start">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                className={SETTINGS_CONTROL_SURFACE}
                value={formData.businessName}
                onChange={(e) => handleInputChange("businessName", e.target.value)}
                disabled={editingSection !== "business"}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Label htmlFor="businessEasetag" className="mb-0">
                    Easetag
                  </Label>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
                          aria-label="What is Easetag for?"
                        >
                          <Info className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px] text-xs">
                        People can send your business money for free using your Easetag.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {editingSection === "business" ? (
                  <div className="w-[10rem] shrink-0 text-right text-xs leading-tight text-balance break-words">
                    {easetagDraftLen > 0 ? (
                      easetagDraftLen < 4 ? (
                        <span className="text-muted-foreground">Min 4 characters</span>
                      ) : easetagAvail.checkingEasetag ? (
                        <span className="text-muted-foreground">Checking…</span>
                      ) : easetagAvail.easetagValidationError ? (
                        <span className="line-clamp-2 text-destructive">{easetagAvail.easetagValidationError}</span>
                      ) : easetagAvail.easetagAvailable === true ? (
                        <span className="inline-flex items-center justify-end gap-1 text-primary">
                          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Available
                        </span>
                      ) : easetagAvail.easetagAvailable === false ? (
                        <span className="text-destructive">Already taken</span>
                      ) : null
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div
                className={`flex overflow-hidden rounded-md border border-input ${SETTINGS_CONTROL_SURFACE}`}
              >
                <span className="flex items-center border-r border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                  @
                </span>
                <Input
                  id="businessEasetag"
                  className="rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                  value={formData.easetag}
                  onChange={(e) => handleEasetagInput(e.target.value)}
                  disabled={editingSection !== "business"}
                  placeholder="yourbusiness"
                  autoCapitalize="none"
                />
              </div>
            </div>
            <BusinessLogoField
              value={formData.businessLogo}
              onChange={(v) => handleInputChange("businessLogo", v)}
              disabled={editingSection !== "business"}
              compact
              className="w-full md:w-fit md:max-w-[11rem] md:justify-self-end"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="businessIndustry">Business industry</Label>
              <BusinessIndustryCombobox
                id="businessIndustry"
                value={formData.businessType}
                onChange={(id) => handleInputChange("businessType", id)}
                disabled={editingSection !== "business"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseCurrency">Base currency</Label>
              {baseCurrenciesError ? (
                <p className="text-sm text-destructive" role="status">
                  {baseCurrenciesError}
                </p>
              ) : null}
              <Select
                value={formData.baseCurrency}
                onValueChange={(value) => handleInputChange("baseCurrency", value)}
                disabled={
                  editingSection !== "business" ||
                  baseCurrenciesLoading ||
                  !baseCurrencies ||
                  baseCurrencies.length === 0
                }
              >
                <SelectTrigger
                  id="baseCurrency"
                  className={`h-10 w-full data-[size=default]:h-10 ${SETTINGS_CONTROL_SURFACE}`}
                >
                  <SelectValue
                    placeholder={
                      baseCurrenciesLoading ? "Loading currencies…" : "Select base currency"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {formData.baseCurrency &&
                  baseCurrencies &&
                  !baseCurrencies.some((c) => c.code === formData.baseCurrency) ? (
                    <SelectItem value={formData.baseCurrency}>
                      <BaseCurrencyOptionLabel
                        code={formData.baseCurrency}
                        suffix={
                          <span className="truncate text-xs text-muted-foreground">
                            (current — not in allowed list)
                          </span>
                        }
                      />
                    </SelectItem>
                  ) : null}
                  {(baseCurrencies ?? []).map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <BaseCurrencyOptionLabel code={c.code} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Business Description</Label>
            <textarea
              id="description"
              className={`w-full min-h-[100px] resize-none rounded-md border border-input px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50 md:text-sm ${SETTINGS_CONTROL_SURFACE}`}
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              disabled={editingSection !== "business"}
            />
          </div>
          </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Legal Entity
            </CardTitle>
            {loading ? (
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            ) : editingSection === "legal" ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={Boolean(savingSection)}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSave("legal")} disabled={Boolean(savingSection)}>
                  {savingSection === "legal" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  Save
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => handleEdit("legal")}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-4">
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              </div>
            </div>
          ) : (
          <>
          <div className="space-y-2">
            <Label>Country</Label>
            {editingSection === "legal" ? (
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={countryOpen}
                    className={`h-10 w-full justify-between font-normal ${SETTINGS_CONTROL_SURFACE}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {selectedCountry ? (
                        <>
                          <CountryFlag code={selectedCountry.code} size={22} />
                          <span className="truncate">{selectedCountry.name}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Select country</span>
                      )}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                  <Command>
                    <CommandInput placeholder="Search country..." />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>
                        {kybCountryPolicy.loading ? "Loading countries…" : "No country found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {countriesForKybPicker.map((c) => (
                          <CommandItem
                            key={c.code}
                            value={c.name}
                            onSelect={() => handleCountryChange(c.code)}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <CountryFlag code={c.code} size={22} />
                              <span className="flex-1">{c.name}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled
                tabIndex={-1}
                className={`h-10 w-full justify-between font-normal ${SETTINGS_CONTROL_SURFACE}`}
                aria-readonly="true"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {selectedCountry ? (
                    <>
                      <CountryFlag code={selectedCountry.code} size={22} />
                      <span className="truncate">{selectedCountry.name}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{formData.country || "—"}</span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
              </Button>
            )}
          </div>

          {kybFields.length > 0 && (
            <div className="pt-2 space-y-4">
              <div className={kybFields.length > 1 ? "grid grid-cols-1 md:grid-cols-2 gap-4" : ""}>
                {kybFields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={field.id}>{field.label}</Label>
                    <Input
                      id={field.id}
                      className={SETTINGS_CONTROL_SURFACE}
                      value={formData[field.id as keyof typeof formData] as string}
                      onChange={(e) =>
                        handleInputChange(field.id as keyof BusinessSettingsForm, e.target.value)
                      }
                      placeholder={field.placeholder}
                      disabled={editingSection !== "legal"}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Registered Address
            </CardTitle>
            {loading ? (
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            ) : editingSection === "address" ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={Boolean(savingSection)}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSave("address")} disabled={Boolean(savingSection)}>
                  {savingSection === "address" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  Save
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => handleEdit("address")}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-4">
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              </div>
            </div>
          ) : (
          <>
          <div className="space-y-2">
            <Label htmlFor="street">Street Address</Label>
            <Input
              id="street"
              className={SETTINGS_CONTROL_SURFACE}
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              disabled={editingSection !== "address"}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                className={SETTINGS_CONTROL_SURFACE}
                value={formData.city}
                onChange={(e) => handleInputChange("city", e.target.value)}
                disabled={editingSection !== "address"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                className={SETTINGS_CONTROL_SURFACE}
                value={formData.state}
                onChange={(e) => handleInputChange("state", e.target.value)}
                disabled={editingSection !== "address"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                className={SETTINGS_CONTROL_SURFACE}
                value={formData.zipCode}
                onChange={(e) => handleInputChange("zipCode", e.target.value)}
                disabled={editingSection !== "address"}
              />
            </div>
          </div>
          </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Public Information
            </CardTitle>
            {loading ? (
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            ) : editingSection === "public" ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={Boolean(savingSection)}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSave("public")} disabled={Boolean(savingSection)}>
                  {savingSection === "public" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  Save
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => handleEdit("public")}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-4">
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            </div>
          ) : (
          <>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              className={SETTINGS_CONTROL_SURFACE}
              value={formData.website}
              onChange={(e) => handleInputChange("website", e.target.value)}
              disabled={editingSection !== "public"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supportEmail">Support Email</Label>
            <Input
              id="supportEmail"
              className={SETTINGS_CONTROL_SURFACE}
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              disabled={editingSection !== "public"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Business Phone</Label>
            <Input
              id="phone"
              className={SETTINGS_CONTROL_SURFACE}
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              disabled={editingSection !== "public"}
            />
          </div>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
