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
import { BaseCurrencyOptionLabel } from "@/components/base-currency-option-label"
import { BusinessIndustryCombobox } from "@/components/settings/business-industry-combobox"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { SETTINGS_CARD_COPY } from "@/lib/copy/business-ui-copy"
import { useBusinessEasetagAvailability } from "@/hooks/use-business-easetag-availability"
import { useAllowedBaseCurrencies } from "@/hooks/use-allowed-base-currencies"
import { formatPostalAddressLine, hasPostalAddressParts } from "@easner/shared/postal-address"
import { BusinessAddressFields } from "@/components/settings/business-address-fields"
import { ensureBusinessOperationalAddressCountriesRegistered } from "@/lib/address/register-lib-address-countries"
import {
  SETTINGS_COMBOBOX_TRIGGER_CLASS,
  SETTINGS_CONTROL_SURFACE,
  SETTINGS_FIELD_HEIGHT_CLASS,
  SETTINGS_INPUT_CLASS,
  SETTINGS_SELECT_TRIGGER_CLASS,
} from "@/lib/settings-control-surface"
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
  const loading = profile.isLoading && !profile.hasData
  const {
    currencies: baseCurrencies,
    loading: baseCurrenciesLoading,
    error: baseCurrenciesError,
  } = useAllowedBaseCurrencies()
  const [countryCode, setCountryCode] = useState("")
  const [addressCountryCode, setAddressCountryCode] = useState("")
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
    void ensureBusinessOperationalAddressCountriesRegistered()
  }, [])

  useEffect(() => {
    if (profile.isLoading) return
    // Avoid overwriting in-flight edits while a section is open.
    if (editingSection === "business" || editingSection === "address") return
    const registrationCode = countryCodeFromProfile({
      countryCode: profile.registrationCountryCode,
      country: profile.registrationCountry,
    })
    const operationalCode = countryCodeFromProfile({
      countryCode: profile.countryCode,
      country: profile.country,
    })
    setCountryCode(registrationCode)
    setAddressCountryCode(operationalCode)
    const operationalCountryRow = getCountryFromCode(operationalCode)
    const countryLabel = profile.country?.trim() || operationalCountryRow?.name || ""
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
    profile.registrationCountry,
    profile.registrationCountryCode,
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
          baseCurrency: formData.baseCurrency,
          businessDescription: formData.description,
        })
      } else if (section === "address") {
        updated = await updateBusinessProfile({
          addressLine1: formData.address,
          city: formData.city,
          state: formData.state,
          postalCode: formData.zipCode,
          ...(addressCountryCode.trim() ? { countryCode: addressCountryCode } : {}),
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
    const nextRegistrationCode = countryCodeFromProfile({
      countryCode: p.registrationCountryCode,
      country: p.registrationCountry,
    })
    const nextOperationalCode = countryCodeFromProfile({
      countryCode: p.countryCode,
      country: p.country,
    })
    setCountryCode(nextRegistrationCode)
    setAddressCountryCode(nextOperationalCode)
    const operationalCountryRow = getCountryFromCode(nextOperationalCode)
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
      country: p.country?.trim() || operationalCountryRow?.name || prev.country,
    }))
    setEditingSection(null)
  }
  const handleInputChange = <K extends keyof BusinessSettingsForm>(field: K, value: BusinessSettingsForm[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleAddressCountryChange = (code: string) => {
    setAddressCountryCode(code)
    const c = getCountryFromCode(code)
    if (c) handleInputChange("country", c.name)
  }

  const selectedCountry = getCountryFromCode(countryCode)
  const kybFields = getKybFields(countryCode)
  const profileLocked = profile.profileLocked ?? false
  const registeredAddressDisplay = useMemo(
    () =>
      formatPostalAddressLine({
        line1: profile.registeredAddressLine1,
        city: profile.registeredAddressCity,
        state: profile.registeredAddressState,
        postalCode: profile.registeredAddressPostalCode,
        country: profile.registrationCountry ?? profile.country,
      }),
    [
      profile.registeredAddressLine1,
      profile.registeredAddressCity,
      profile.registeredAddressState,
      profile.registeredAddressPostalCode,
      profile.registrationCountry,
      profile.country,
    ],
  )
  const hasRegisteredAddress = useMemo(
    () =>
      hasPostalAddressParts({
        line1: profile.registeredAddressLine1,
        city: profile.registeredAddressCity,
        state: profile.registeredAddressState,
        postalCode: profile.registeredAddressPostalCode,
      }),
    [
      profile.registeredAddressLine1,
      profile.registeredAddressCity,
      profile.registeredAddressState,
      profile.registeredAddressPostalCode,
    ],
  )
  const easetagDraftLen = formData.easetag.replace(/^@/, "").trim().length
  const easetagStatus =
    easetagDraftLen > 0 ?
      easetagDraftLen < 4 ? (
        <span className="text-muted-foreground">Min 4 characters</span>
      ) : easetagAvail.checkingEasetag ? (
        <span className="text-muted-foreground">Checking...</span>
      ) : easetagAvail.easetagValidationError ? (
        <span className="truncate text-destructive">{easetagAvail.easetagValidationError}</span>
      ) : easetagAvail.easetagAvailable === true ? (
        <span className="inline-flex items-center justify-end gap-1 text-primary">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Available
        </span>
      ) : easetagAvail.easetagAvailable === false ? (
        <span className="text-destructive">Already taken</span>
      ) : null
    : null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Business Information
              </CardTitle>
            }
            description={SETTINGS_CARD_COPY.businessInfo}
            actions={
              loading ? (
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
              )
            }
          />
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
                className={SETTINGS_INPUT_CLASS}
                value={formData.businessName}
                onChange={(e) => handleInputChange("businessName", e.target.value)}
                disabled={profileLocked || editingSection !== "business"}
              />
            </div>
            <div className="relative min-w-0 space-y-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
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
                  <div className="absolute right-0 top-0 w-[10rem] text-right text-xs leading-tight">
                    <div className="flex min-h-5 items-center justify-end">
                      {easetagStatus ? easetagStatus : <span className="invisible">Status</span>}
                    </div>
                  </div>
                ) : null}
              </div>
              <div
                className={`flex ${SETTINGS_FIELD_HEIGHT_CLASS} overflow-hidden rounded-md border border-input ${SETTINGS_CONTROL_SURFACE}`}
              >
                <span className="flex h-full items-center border-r border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                  @
                </span>
                <Input
                  id="businessEasetag"
                  className="h-full min-h-0 rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 dark:bg-transparent"
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
                <SelectTrigger id="baseCurrency" className={SETTINGS_SELECT_TRIGGER_CLASS}>
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
                            (current – not in allowed list)
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

      {profile.tier1Complete ? (
      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Legal Entity
              </CardTitle>
            }
            description={SETTINGS_CARD_COPY.legalEntity}
            actions={
              loading ? <div className="h-9 w-24 animate-pulse rounded-md bg-muted" /> : null
            }
          />
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
            <Button
              type="button"
              variant="outline"
              disabled
              tabIndex={-1}
              className={SETTINGS_COMBOBOX_TRIGGER_CLASS}
              aria-readonly="true"
            >
              <span className="flex min-w-0 items-center gap-2">
                {selectedCountry ? (
                  <>
                    <CountryFlag code={selectedCountry.code} size={22} />
                    <span className="truncate">{selectedCountry.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{formData.country || "–"}</span>
                )}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
            </Button>
          </div>

          {kybFields.length > 0 && (
            <div className="pt-2 space-y-4">
              <div className={kybFields.length > 1 ? "grid grid-cols-1 md:grid-cols-2 gap-4" : ""}>
                {kybFields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={field.id}>{field.label}</Label>
                    <Input
                      id={field.id}
                      className={SETTINGS_INPUT_CLASS}
                      value={formData[field.id as keyof typeof formData] as string}
                      readOnly
                      disabled
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="registeredAddress">Registered Address</Label>
            <Input
              id="registeredAddress"
              readOnly
              className={SETTINGS_INPUT_CLASS}
              value={
                hasRegisteredAddress
                  ? registeredAddressDisplay
                  : SETTINGS_CARD_COPY.registeredAddress
              }
              disabled
            />
          </div>
          </>
          )}
        </CardContent>
      </Card>
      ) : null}

      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Business Address
              </CardTitle>
            }
            description={SETTINGS_CARD_COPY.businessAddress}
            actions={
              loading ? (
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
              )
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              </div>
            </div>
          ) : (
          <>
          <BusinessAddressFields
            countryCode={addressCountryCode}
            values={{
              line1: formData.address,
              city: formData.city,
              state: formData.state,
              postalCode: formData.zipCode,
            }}
            onChange={(patch) => {
              if (patch.line1 !== undefined) handleInputChange("address", patch.line1)
              if (patch.city !== undefined) handleInputChange("city", patch.city)
              if (patch.state !== undefined) handleInputChange("state", patch.state)
              if (patch.postalCode !== undefined) handleInputChange("zipCode", patch.postalCode)
            }}
            onCountryCodeChange={handleAddressCountryChange}
            editing={editingSection === "address"}
            disabled={editingSection !== "address"}
          />
          </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Public Information
              </CardTitle>
            }
            description={SETTINGS_CARD_COPY.publicInfo}
            actions={
              loading ? (
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
              )
            }
          />
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
              className={SETTINGS_INPUT_CLASS}
              value={formData.website}
              onChange={(e) => handleInputChange("website", e.target.value)}
              disabled={editingSection !== "public"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supportEmail">Support Email</Label>
            <Input
              id="supportEmail"
              className={SETTINGS_INPUT_CLASS}
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
              className={SETTINGS_INPUT_CLASS}
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
