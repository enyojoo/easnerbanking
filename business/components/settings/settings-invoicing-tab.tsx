"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileText } from "lucide-react"
import { useBusinessProfile, type BusinessProfile } from "@/lib/use-business-profile"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { InvoicePaymentDefaults } from "@/lib/b2b/types"
import {
  DEFAULT_INVOICE_PAYMENT_DEFAULTS,
  type BusinessInvoiceSettings,
} from "@/lib/invoices/invoice-settings"
import { toast } from "sonner"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { SettingsStripeConnectPanel } from "@/components/settings/settings-stripe-connect-panel"
import { SETTINGS_CARD_COPY } from "@/lib/copy/business-ui-copy"

export function SettingsInvoicingTab() {
  const profile = useBusinessProfile()
  const [settings, setSettings] = useState<BusinessInvoiceSettings>({
    ...DEFAULT_INVOICE_PAYMENT_DEFAULTS,
  })
  const settingsRef = useRef(settings)

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice payment methods
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="show-online">Pay online</Label>
              <p className="text-sm text-muted-foreground">
                Card and bank pay-in via Stripe when enabled for your platform
              </p>
            </div>
            <Switch
              id="show-online"
              checked={settings.showOnlinePayment !== false}
              onCheckedChange={(v) => patch({ showOnlinePayment: v })}
            />
          </div>
          <div className="space-y-2">
            <Label>Preferred tab when multiple methods are shown</Label>
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
                <SelectItem value="customer_choice">Customer choice</SelectItem>
                <SelectItem value="online">Pay online</SelectItem>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="stablecoin">Stablecoin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="pdf-pay">Include payment link on PDF</Label>
              <p className="text-sm text-muted-foreground">
                Adds a link to the live invoice page where customers choose how to pay
              </p>
            </div>
            <Switch
              id="pdf-pay"
              checked={settings.includePaymentOnPdf}
              onCheckedChange={(v) => patch({ includePaymentOnPdf: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="email-pay">Include payment instructions in invoice emails</Label>
              <p className="text-sm text-muted-foreground">
                Tells customers they can pay via the invoice link (online, bank, or stablecoin)
              </p>
            </div>
            <Switch
              id="email-pay"
              checked={settings.includePaymentInEmail}
              onCheckedChange={(v) => patch({ includePaymentInEmail: v })}
            />
          </div>
        </CardContent>
      </Card>

      {settings.showOnlinePayment !== false ? <SettingsStripeConnectPanel /> : null}

      <Card>
        <CardHeader>
          <SettingsCardHeader
            title="Notifications"
            description={SETTINGS_CARD_COPY.invoiceNotifications}
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 text-sm">
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
          </div>

          <div className="space-y-6 border-t pt-6">
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
