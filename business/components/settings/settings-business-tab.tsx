"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Building2, Globe, FileText, MapPin, Edit, X, Check, ChevronDown } from "lucide-react"
import { BusinessLogoField } from "@/components/business-logo-field"
import { countries } from "@/lib/countries"
import { getKybFields } from "@/lib/kyb-by-country"
import { updateBusinessProfile, useBusinessProfile } from "@/lib/use-business-profile"
import { CountryFlag } from "@/components/flags"
import { BusinessVerificationSection } from "@/components/compliance/business-verification-section"
import { fetchWithSession } from "@/lib/fetch-with-session"

function getCountryFromCode(code: string) {
  return countries.find((c) => c.code === code)
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
  const [countryCode, setCountryCode] = useState("US")
  const [countryOpen, setCountryOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [easetagAvailable, setEasetagAvailable] = useState<boolean | null>(null)
  const [checkingEasetag, setCheckingEasetag] = useState(false)
  const easetagCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    const code = profile.countryCode ?? "US"
    setCountryCode(code)
    const c = getCountryFromCode(code)
    if (c) setFormData((prev) => ({ ...prev, country: c.name }))
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
      country: profile.country || prev.country,
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
  ])

  const checkEasetagAvailability = async (raw: string) => {
    const trimmed = raw.replace(/^@/, "").trim().toLowerCase()
    if (!trimmed || trimmed === (profile.easetag || "").replace(/^@/, "").toLowerCase()) {
      setEasetagAvailable(null)
      return
    }
    setCheckingEasetag(true)
    try {
      const res = await fetchWithSession(
        `/api/business/easetag/check?easetag=${encodeURIComponent(trimmed)}`,
      )
      const data = (await res.json()) as { available?: boolean; valid?: boolean }
      setEasetagAvailable(data.valid !== false && Boolean(data.available))
    } catch {
      setEasetagAvailable(false)
    } finally {
      setCheckingEasetag(false)
    }
  }

  const handleEasetagInput = (value: string) => {
    const clean = value.replace(/^@/g, "").replace(/\s/g, "")
    handleInputChange("easetag", clean)
    setEasetagAvailable(null)
    if (easetagCheckTimeout.current) clearTimeout(easetagCheckTimeout.current)
    if (!clean || clean === (profile.easetag || "")) {
      setEasetagAvailable(null)
      return
    }
    easetagCheckTimeout.current = setTimeout(() => void checkEasetagAvailability(clean), 400)
  }

  const handleEdit = (section: string) => setEditingSection(section)
  const handleCancel = () => {
    setEditingSection(null)
    setEasetagAvailable(null)
    if (easetagCheckTimeout.current) clearTimeout(easetagCheckTimeout.current)
  }
  const handleSave = async (section: string) => {
    if (section === "business") {
      await updateBusinessProfile({
        businessName: formData.businessName,
        easetag: formData.easetag.trim() ? formData.easetag.trim().replace(/^@/, "").toLowerCase() : null,
        businessLogo: formData.businessLogo,
        businessType: formData.businessType,
        registrationNumber: formData.registrationNumber,
        taxId: formData.taxId,
        baseCurrency: formData.baseCurrency,
        businessDescription: formData.description,
      })
    }
    if (section === "legal") {
      await updateBusinessProfile({
        countryCode,
        registrationNumber: formData.registrationNumber,
        taxId: formData.taxId,
      })
    }
    if (section === "address") {
      await updateBusinessProfile({
        addressLine1: formData.address,
        city: formData.city,
        state: formData.state,
        postalCode: formData.zipCode,
        countryCode,
      })
    }
    if (section === "public") {
      await updateBusinessProfile({
        website: formData.website,
        supportEmail: formData.email,
        supportPhone: formData.phone,
      })
    }
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
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSave("business")}>
                  <Check className="h-4 w-4 mr-1" />
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
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-28 w-full animate-pulse rounded-md bg-muted" />
            </div>
          ) : (
          <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-start">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                value={formData.businessName}
                onChange={(e) => handleInputChange("businessName", e.target.value)}
                disabled={editingSection !== "business"}
              />
              <div className="space-y-1">
                <Label htmlFor="businessEasetag">Easetag</Label>
                <div className="flex rounded-md shadow-xs border border-input overflow-hidden bg-background">
                  <span className="flex items-center px-3 text-muted-foreground text-sm border-r border-input bg-muted/40">
                    @
                  </span>
                  <Input
                    id="businessEasetag"
                    className="border-0 shadow-none focus-visible:ring-0 rounded-none"
                    value={formData.easetag}
                    onChange={(e) => handleEasetagInput(e.target.value)}
                    disabled={editingSection !== "business"}
                    placeholder="yourbusiness"
                    autoCapitalize="none"
                  />
                </div>
                {editingSection === "business" && formData.easetag && !checkingEasetag && easetagAvailable === true && (
                  <p className="text-xs text-green-600">Available</p>
                )}
                {editingSection === "business" && formData.easetag && !checkingEasetag && easetagAvailable === false && (
                  <p className="text-xs text-destructive">Already taken or invalid</p>
                )}
                {editingSection === "business" && checkingEasetag && (
                  <p className="text-xs text-muted-foreground">Checking…</p>
                )}
                <p className="text-xs text-muted-foreground">Public handle for your business (global; must be unique).</p>
              </div>
            </div>
            <BusinessLogoField
              value={formData.businessLogo}
              onChange={(v) => handleInputChange("businessLogo", v)}
              disabled={editingSection !== "business"}
              compact
              className="md:max-w-[220px]"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="businessType">Business Type</Label>
              <Input
                id="businessType"
                value={formData.businessType}
                onChange={(e) => handleInputChange("businessType", e.target.value)}
                disabled={editingSection !== "business"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseCurrency">Base Currency</Label>
              <Select
                value={formData.baseCurrency}
                onValueChange={(value) => handleInputChange("baseCurrency", value)}
                disabled={editingSection !== "business"}
              >
                <SelectTrigger className="h-10 w-full data-[size=default]:h-10">
                  <SelectValue placeholder="Select base currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                  <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                  <SelectItem value="CHF">CHF - Swiss Franc</SelectItem>
                  <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Business Description</Label>
            <textarea
              id="description"
              className="w-full min-h-[100px] px-3 py-2 border border-input rounded-md resize-none disabled:opacity-50"
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
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSave("legal")}>
                  <Check className="h-4 w-4 mr-1" />
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
                    className="w-full justify-between h-10 font-normal"
                  >
                    {selectedCountry ? (
                      <div className="flex items-center gap-2">
                        <CountryFlag code={selectedCountry.code} size={22} />
                        <span>{selectedCountry.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select country</span>
                    )}
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                  <Command>
                    <CommandInput placeholder="Search country..." />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>No country found.</CommandEmpty>
                      <CommandGroup>
                        {countries.map((c) => (
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
              <div className="flex items-center gap-2 h-10 px-3 py-2 rounded-md border bg-muted/30">
                {selectedCountry && (
                  <>
                    <CountryFlag code={selectedCountry.code} size={22} />
                    <span>{selectedCountry.name}</span>
                  </>
                )}
                {!selectedCountry && <span className="text-muted-foreground">{formData.country || "—"}</span>}
              </div>
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
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSave("address")}>
                  <Check className="h-4 w-4 mr-1" />
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
                value={formData.city}
                onChange={(e) => handleInputChange("city", e.target.value)}
                disabled={editingSection !== "address"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => handleInputChange("state", e.target.value)}
                disabled={editingSection !== "address"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
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
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSave("public")}>
                  <Check className="h-4 w-4 mr-1" />
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
              value={formData.website}
              onChange={(e) => handleInputChange("website", e.target.value)}
              disabled={editingSection !== "public"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supportEmail">Support Email</Label>
            <Input
              id="supportEmail"
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
