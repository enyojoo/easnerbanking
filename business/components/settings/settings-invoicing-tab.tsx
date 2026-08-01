"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Check, Edit, FileText, Loader2, Palette, X } from "lucide-react"
import { useBusinessProfile, type BusinessProfile } from "@/lib/use-business-profile"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { SETTINGS_CONTROL_SURFACE } from "@/lib/settings-control-surface"
import type { InvoicePaymentDefaults } from "@/lib/b2b/types"
import {
  DEFAULT_INVOICE_PAYMENT_DEFAULTS,
  type BusinessInvoiceSettings,
} from "@/lib/invoices/invoice-settings"
import { toast } from "sonner"
import { SettingsTabIntro } from "@/components/settings/settings-tab-intro"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { SETTINGS_CARD_COPY, SETTINGS_TAB_COPY } from "@/lib/copy/business-ui-copy"

type BrandingForm = {
  brandColor: string
  footerText: string
}

function brandingFromSettings(settings: BusinessInvoiceSettings): BrandingForm {
  return {
    brandColor: settings.brandColor ?? "",
    footerText: settings.footerText ?? "",
  }
}

export function SettingsInvoicingTab() {
  const profile = useBusinessProfile()
  const [settings, setSettings] = useState<BusinessInvoiceSettings>({
    ...DEFAULT_INVOICE_PAYMENT_DEFAULTS,
  })
  const settingsRef = useRef(settings)
  const [editingBranding, setEditingBranding] = useState(false)
  const [brandingForm, setBrandingForm] = useState<BrandingForm>({
    brandColor: "",
    footerText: "",
  })
  const [savingBranding, setSavingBranding] = useState(false)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    if (profile.invoiceSettings) {
      setSettings({ ...DEFAULT_INVOICE_PAYMENT_DEFAULTS, ...profile.invoiceSettings })
    }
  }, [profile.invoiceSettings])

  const persistSettings = useCallback(async (next: BusinessInvoiceSettings) => {
    try {
      const res = await fetchWithSession("/api/business/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceSettings: next }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || "Failed to save")
      }
      const json = (await res.json()) as { profile?: BusinessProfile }
      if (json.profile) {
        window.dispatchEvent(
          new CustomEvent("business-profile-updated", { detail: json.profile }),
        )
      }
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save invoicing settings")
      return false
    }
  }, [])

  const patch = useCallback(
    (partial: Partial<InvoicePaymentDefaults>) => {
      const optimistic = { ...settingsRef.current, ...partial }
      setSettings(optimistic)
      void persistSettings(optimistic)
    },
    [persistSettings],
  )

  const handleEditBranding = () => {
    setBrandingForm(brandingFromSettings(settingsRef.current))
    setEditingBranding(true)
  }

  const handleCancelBranding = () => {
    setEditingBranding(false)
  }

  const handleSaveBranding = async () => {
    setSavingBranding(true)
    try {
      const optimistic: BusinessInvoiceSettings = {
        ...settingsRef.current,
        brandColor: brandingForm.brandColor.trim() || undefined,
        footerText: brandingForm.footerText.trim() || undefined,
      }
      setSettings(optimistic)
      const ok = await persistSettings(optimistic)
      if (ok) setEditingBranding(false)
    } finally {
      setSavingBranding(false)
    }
  }

  return (
    <div className="space-y-6">
      <SettingsTabIntro title={SETTINGS_TAB_COPY.invoicing.title} description={SETTINGS_TAB_COPY.invoicing.intro} />
      <Card>
        <CardHeader>
          <SettingsCardHeader
            title="Customer email delivery"
            description={SETTINGS_CARD_COPY.invoiceEmailDelivery}
          />
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Reply-To for customers</span>
            <span className="font-medium text-right">
              {profile.invoiceReplyEmail?.trim() || "Add support email in Business settings"}
            </span>
          </div>
          {profile.invoiceReplyEmailSource ? (
            <p className="text-xs text-muted-foreground">
              Resolved from{" "}
              {profile.invoiceReplyEmailSource === "support"
                ? "Settings → Business → Support Email"
                : profile.invoiceReplyEmailSource === "owner"
                  ? "organization owner account email"
                  : "your account email"}
              .
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Default payment methods
              </CardTitle>
            }
            description={SETTINGS_CARD_COPY.invoicePaymentDefaults}
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="show-bank">Bank transfer</Label>
              <p className="text-sm text-muted-foreground">Show virtual account details when available</p>
            </div>
            <Switch
              id="show-bank"
              checked={settings.showBankTransfer}
              onCheckedChange={(v) => patch({ showBankTransfer: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="show-stable">Stablecoin</Label>
              <p className="text-sm text-muted-foreground">Show wallet deposit address when available</p>
            </div>
            <Switch
              id="show-stable"
              checked={settings.showStablecoin}
              onCheckedChange={(v) => patch({ showStablecoin: v })}
            />
          </div>
          <div className="space-y-2">
            <Label>Preferred tab when both are shown</Label>
            <Select
              value={settings.preferredMethod}
              onValueChange={(v) =>
                patch({
                  preferredMethod: v as InvoicePaymentDefaults["preferredMethod"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer_choice">Customer choice (bank first)</SelectItem>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="stablecoin">Stablecoin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="pdf-pay">Include payment details on PDF</Label>
            </div>
            <Switch
              id="pdf-pay"
              checked={settings.includePaymentOnPdf}
              onCheckedChange={(v) => patch({ includePaymentOnPdf: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="email-pay">Include payment details in invoice emails</Label>
            </div>
            <Switch
              id="email-pay"
              checked={settings.includePaymentInEmail}
              onCheckedChange={(v) => patch({ includePaymentInEmail: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SettingsCardHeader
            title="Notifications"
            description={SETTINGS_CARD_COPY.invoiceNotifications}
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="view-notify">Email when customer views invoice</Label>
              <p className="text-sm text-muted-foreground">Sent once on first customer view</p>
            </div>
            <Switch
              id="view-notify"
              checked={settings.notifyOnInvoiceView !== false}
              onCheckedChange={(v) => patch({ notifyOnInvoiceView: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="receipt-notify">Email receipt to customer when marked paid</Label>
            </div>
            <Switch
              id="receipt-notify"
              checked={settings.sendReceiptOnPaid !== false}
              onCheckedChange={(v) => patch({ sendReceiptOnPaid: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Branding
              </CardTitle>
            }
            description={SETTINGS_CARD_COPY.invoiceBranding}
            actions={
              editingBranding ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelBranding}
                    disabled={savingBranding}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleSaveBranding()}
                    disabled={savingBranding}
                  >
                    {savingBranding ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden />
                    )}
                    Save
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={handleEditBranding} className="shrink-0">
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brand-color">Accent color (hex)</Label>
            <Input
              id="brand-color"
              className={SETTINGS_CONTROL_SURFACE}
              placeholder="#0066cc"
              value={editingBranding ? brandingForm.brandColor : settings.brandColor ?? ""}
              onChange={(e) =>
                setBrandingForm((prev) => ({ ...prev, brandColor: e.target.value }))
              }
              disabled={!editingBranding}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer-text">Footer text</Label>
            <Input
              id="footer-text"
              className={SETTINGS_CONTROL_SURFACE}
              placeholder="Thank you for your business"
              value={editingBranding ? brandingForm.footerText : settings.footerText ?? ""}
              onChange={(e) =>
                setBrandingForm((prev) => ({ ...prev, footerText: e.target.value }))
              }
              disabled={!editingBranding}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
