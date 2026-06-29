"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { FileText } from "lucide-react"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { InvoicePaymentDefaults } from "@/lib/b2b/types"
import { DEFAULT_INVOICE_PAYMENT_DEFAULTS } from "@/lib/invoices/invoice-settings"
import { toast } from "sonner"

export function SettingsInvoicingTab() {
  const profile = useBusinessProfile()
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<InvoicePaymentDefaults>({
    ...DEFAULT_INVOICE_PAYMENT_DEFAULTS,
  })

  useEffect(() => {
    if (profile.invoiceSettings) {
      setSettings({ ...DEFAULT_INVOICE_PAYMENT_DEFAULTS, ...profile.invoiceSettings })
    }
  }, [profile.invoiceSettings])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetchWithSession("/api/business/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceSettings: settings }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || "Failed to save")
      }
      const json = (await res.json()) as { profile?: typeof profile }
      if (json.profile) {
        window.dispatchEvent(new CustomEvent("business-profile-updated", { detail: json.profile }))
      }
      toast.success("Invoicing settings saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save invoicing settings")
    } finally {
      setSaving(false)
    }
  }, [settings])

  const patch = (partial: Partial<InvoicePaymentDefaults>) => {
    setSettings((prev) => ({ ...prev, ...partial }))
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Customer email delivery</CardTitle>
          <CardDescription>
            Invoice emails are sent from Easner Business (<strong>invoices@easner.com</strong>).
            Customer replies go to your business support email below.
          </CardDescription>
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
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Default payment methods
          </CardTitle>
          <CardDescription>
            Control which payment options appear on new invoices. You can override per invoice when
            creating or editing.
          </CardDescription>
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
          <CardTitle>Notifications</CardTitle>
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
          <CardTitle>Branding</CardTitle>
          <CardDescription>Optional styling for PDF and public invoice view</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brand-color">Accent color (hex)</Label>
            <Input
              id="brand-color"
              placeholder="#0066cc"
              value={settings.brandColor ?? ""}
              onChange={(e) => patch({ brandColor: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer-text">Footer text</Label>
            <Input
              id="footer-text"
              placeholder="Thank you for your business"
              value={settings.footerText ?? ""}
              onChange={(e) => patch({ footerText: e.target.value || undefined })}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save invoicing settings"}
      </Button>
    </div>
  )
}
