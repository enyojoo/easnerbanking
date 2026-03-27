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
import { Building2 } from "lucide-react"
import { updateBusinessProfile, useBusinessProfile } from "@/lib/use-business-profile"
import { BusinessLogoField } from "@/components/business-logo-field"

export function BusinessOnboardingDialog() {
  const profile = useBusinessProfile()
  const [open, setOpen] = useState(false)
  const [businessName, setBusinessName] = useState("")
  const [businessLogo, setBusinessLogo] = useState<string | null>(null)
  const [businessType, setBusinessType] = useState("Financial Services")
  const [baseCurrency, setBaseCurrency] = useState("USD")
  const [businessDescription, setBusinessDescription] = useState(
    "A modern digital banking platform providing seamless financial services.",
  )
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile.isLoading) return
    if (!profile.onboardingComplete) {
      setOpen(true)
      setBusinessName(profile.name || "")
      setBusinessLogo(profile.logoUrl ?? null)
      setBusinessType(profile.businessType || "Financial Services")
      setBaseCurrency(profile.baseCurrency || "USD")
      setBusinessDescription(profile.description || "")
      return
    }
    setOpen(false)
  }, [
    profile.isLoading,
    profile.onboardingComplete,
    profile.name,
    profile.logoUrl,
    profile.businessType,
    profile.baseCurrency,
    profile.description,
  ])

  const finishLater = async () => {
    setSaving(true)
    await updateBusinessProfile({
      businessName: businessName.trim() || profile.name,
      businessLogo,
      businessType,
      baseCurrency,
      businessDescription,
      countryCode: profile.countryCode ?? undefined,
    })
    setSaving(false)
    setOpen(false)
  }

  const save = async () => {
    const trimmed = businessName.trim()
    if (!trimmed) {
      setError("Enter your business name to continue.")
      return
    }
    setError("")
    setSaving(true)
    await updateBusinessProfile({
      businessName: trimmed,
      businessLogo,
      businessType,
      baseCurrency,
      businessDescription,
      countryCode: profile.countryCode ?? undefined,
    })
    setSaving(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && finishLater()}>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="onboard-business-type">Business type</Label>
              <Input
                id="onboard-business-type"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label>Base currency</Label>
              <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                <SelectTrigger className="h-10 w-full">
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
            <Label htmlFor="onboard-description">Business description</Label>
            <textarea
              id="onboard-description"
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => void finishLater()} disabled={saving}>
            I&apos;ll do this later
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            Save &amp; continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
