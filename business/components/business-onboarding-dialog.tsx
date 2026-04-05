"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, Check, Info, Loader2 } from "lucide-react"
import { updateBusinessProfile, useBusinessProfile } from "@/lib/use-business-profile"
import { BusinessLogoField } from "@/components/business-logo-field"
import { BaseCurrencyOptionLabel } from "@/components/base-currency-option-label"
import { BusinessIndustryCombobox } from "@/components/settings/business-industry-combobox"
import { useBusinessEasetagAvailability } from "@/hooks/use-business-easetag-availability"
import { useAllowedBaseCurrencies } from "@/hooks/use-allowed-base-currencies"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function BusinessOnboardingDialog() {
  const profile = useBusinessProfile()
  const [open, setOpen] = useState(false)
  const [businessName, setBusinessName] = useState("")
  const [businessLogo, setBusinessLogo] = useState<string | null>(null)
  const [easetag, setEasetag] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [baseCurrency, setBaseCurrency] = useState("USD")
  const [businessDescription, setBusinessDescription] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState<false | "save" | "later">(false)

  const easetagAvail = useBusinessEasetagAvailability({ profileEasetag: profile.easetag })
  const {
    currencies: baseCurrencies,
    loading: baseCurrenciesLoading,
    error: baseCurrenciesError,
  } = useAllowedBaseCurrencies()

  useEffect(() => {
    if (profile.isLoading) return
    if (!profile.hasData) return
    if (!profile.isFresh) return
    if (!profile.onboardingComplete) {
      setOpen(true)
      setBusinessName(profile.name || "")
      setBusinessLogo(profile.logoUrl ?? null)
      setEasetag(profile.easetag || "")
      setBusinessType(profile.businessType || "")
      setBaseCurrency(profile.baseCurrency || "USD")
      setBusinessDescription(profile.description || "")
      return
    }
    setOpen(false)
  }, [
    profile.isLoading,
    profile.hasData,
    profile.isFresh,
    profile.onboardingComplete,
    profile.name,
    profile.logoUrl,
    profile.easetag,
    profile.businessType,
    profile.baseCurrency,
    profile.description,
  ])

  const easetagDraftLen = easetag.replace(/^@/, "").trim().length

  const payloadCore = () => ({
    businessLogo,
    businessType,
    baseCurrency,
    businessDescription,
    countryCode: profile.countryCode ?? undefined,
    easetag: easetag.trim() ? easetag.trim().replace(/^@/, "").toLowerCase() : null,
  })

  const finishLater = async () => {
    setSaving("later")
    try {
      await updateBusinessProfile({
        businessName: businessName.trim() || profile.name,
        ...payloadCore(),
      })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    const trimmed = businessName.trim()
    if (!trimmed) {
      setError("Enter your business name to continue.")
      return
    }
    setError("")
    setSaving("save")
    try {
      await updateBusinessProfile({
        businessName: trimmed,
        ...payloadCore(),
      })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleEasetagInput = (value: string) => {
    const clean = easetagAvail.processInput(value)
    setEasetag(clean)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && void finishLater()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Business Information
          </DialogTitle>
          <DialogDescription>
            Add your business details. You can update these anytime in Settings → Business.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="onboard-business-name">Business name</Label>
              <Input
                id="onboard-business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Acme Inc."
                className="h-10"
              />
            </div>
            <BusinessLogoField value={businessLogo} onChange={setBusinessLogo} compact className="sm:max-w-[200px]" />
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Label htmlFor="onboard-easetag" className="mb-0">
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
              <div className="w-[10rem] shrink-0 text-right text-xs leading-tight text-balance break-words">
                {easetagDraftLen > 0 ? (
                  easetagDraftLen < 4 ? (
                    <span className="text-muted-foreground">Min 4 characters</span>
                  ) : easetagAvail.checkingEasetag ? (
                    <span className="text-muted-foreground">Checking…</span>
                  ) : easetagAvail.easetagValidationError ? (
                    <span className="line-clamp-2 text-destructive">{easetagAvail.easetagValidationError}</span>
                  ) : easetagAvail.easetagAvailable === true ? (
                    <span className="inline-flex items-center justify-end gap-1 text-green-600">
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Available
                    </span>
                  ) : easetagAvail.easetagAvailable === false ? (
                    <span className="text-destructive">Already taken</span>
                  ) : null
                ) : null}
              </div>
            </div>
            <div className="flex overflow-hidden rounded-md border border-input bg-background shadow-xs">
              <span className="flex items-center border-r border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                @
              </span>
              <Input
                id="onboard-easetag"
                className="rounded-none border-0 shadow-none focus-visible:ring-0"
                value={easetag}
                onChange={(e) => handleEasetagInput(e.target.value)}
                placeholder="yourbusiness"
                autoCapitalize="none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="onboard-business-industry">Business industry</Label>
              <BusinessIndustryCombobox
                id="onboard-business-industry"
                value={businessType}
                onChange={setBusinessType}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboard-base-currency">Base currency</Label>
              {baseCurrenciesError ? (
                <p className="text-sm text-destructive" role="status">
                  {baseCurrenciesError}
                </p>
              ) : null}
              <Select
                value={baseCurrency}
                onValueChange={setBaseCurrency}
                disabled={baseCurrenciesLoading || !baseCurrencies || baseCurrencies.length === 0}
              >
                <SelectTrigger id="onboard-base-currency" className="h-10 w-full">
                  <SelectValue
                    placeholder={
                      baseCurrenciesLoading ? "Loading currencies…" : "Select base currency"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {baseCurrency &&
                  baseCurrencies &&
                  !baseCurrencies.some((c) => c.code === baseCurrency) ? (
                    <SelectItem value={baseCurrency}>
                      <BaseCurrencyOptionLabel
                        code={baseCurrency}
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
            <Label htmlFor="onboard-description">Business description</Label>
            <textarea
              id="onboard-description"
              className="border-input bg-background placeholder:text-muted-foreground flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm transition-[border-color] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => void finishLater()} disabled={Boolean(saving)}>
            {saving === "later" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            I&apos;ll do this later
          </Button>
          <Button type="button" onClick={() => void save()} disabled={Boolean(saving)}>
            {saving === "save" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Save &amp; continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
