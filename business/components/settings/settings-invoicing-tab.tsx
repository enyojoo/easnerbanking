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
import {
  INVOICE_SETTINGS_COPY,
  SETTINGS_CARD_COPY,
} from "@/lib/copy/business-ui-copy"

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
    (partial: Partial<BusinessInvoiceSettings>) => {
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
              <Label htmlFor="show-bank">{INVOICE_SETTINGS_COPY.bankTransfer}</Label>
              <p className="text-sm text-muted-foreground">
                {INVOICE_SETTINGS_COPY.bankTransferHelp}
              </p>
            </div>
            <Switch
              id="show-bank"
              checked={settings.showBankTransfer}
              onCheckedChange={(v) => patch({ showBankTransfer: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="show-stable">{INVOICE_SETTINGS_COPY.stablecoin}</Label>
              <p className="text-sm text-muted-foreground">
                {INVOICE_SETTINGS_COPY.stablecoinHelp}
              </p>
            </div>
            <Switch
              id="show-stable"
              checked={settings.showStablecoin}
              onCheckedChange={(v) => patch({ showStablecoin: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="show-online">{INVOICE_SETTINGS_COPY.onlinePayments}</Label>
              <p className="text-sm text-muted-foreground">
                {INVOICE_SETTINGS_COPY.onlinePaymentsHelp}
              </p>
            </div>
            <Switch
              id="show-online"
              checked={settings.showOnlinePayment !== false}
              onCheckedChange={(v) => patch({ showOnlinePayment: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label>{INVOICE_SETTINGS_COPY.defaultPaymentOption}</Label>
            <Select
              value={settings.preferredMethod}
              onValueChange={(v) =>
                patch({
                  preferredMethod: v as InvoicePaymentDefaults["preferredMethod"],
                })
              }
            >
              <SelectTrigger className="w-[13.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="customer_choice">Customer choice</SelectItem>
                <SelectItem value="online">{INVOICE_SETTINGS_COPY.onlinePayments}</SelectItem>
                <SelectItem value="bank">{INVOICE_SETTINGS_COPY.bankTransfer}</SelectItem>
                <SelectItem value="stablecoin">{INVOICE_SETTINGS_COPY.stablecoin}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="pdf-pay">{INVOICE_SETTINGS_COPY.includePaymentOnPdf}</Label>
              <p className="text-sm text-muted-foreground">
                {INVOICE_SETTINGS_COPY.includePaymentOnPdfHelp}
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
              <Label htmlFor="email-pay">{INVOICE_SETTINGS_COPY.includePaymentInEmail}</Label>
              <p className="text-sm text-muted-foreground">
                {INVOICE_SETTINGS_COPY.includePaymentInEmailHelp}
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

      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={INVOICE_SETTINGS_COPY.remindersTitle}
            description={INVOICE_SETTINGS_COPY.remindersIntro}
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="due-reminder">{INVOICE_SETTINGS_COPY.dueDateReminder}</Label>
              <p className="text-sm text-muted-foreground">
                {INVOICE_SETTINGS_COPY.dueDateReminderHelp}
              </p>
            </div>
            <Switch
              id="due-reminder"
              checked={settings.sendDueDateReminder !== false}
              onCheckedChange={(v) => patch({ sendDueDateReminder: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="overdue-reminder">{INVOICE_SETTINGS_COPY.overdueReminder}</Label>
              <p className="text-sm text-muted-foreground">
                {INVOICE_SETTINGS_COPY.overdueReminderHelp}
              </p>
            </div>
            <Switch
              id="overdue-reminder"
              checked={settings.sendOverdueReminder !== false}
              onCheckedChange={(v) => patch({ sendOverdueReminder: v })}
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
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{INVOICE_SETTINGS_COPY.replyTo}</span>
              <span className="font-medium text-right">
                {profile.invoiceReplyEmail?.trim() || INVOICE_SETTINGS_COPY.replyToMissing}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{INVOICE_SETTINGS_COPY.replyToHelp}</p>
          </div>

          <div className="space-y-6 border-t pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="view-notify">{INVOICE_SETTINGS_COPY.notifyOnView}</Label>
                <p className="text-sm text-muted-foreground">
                  {INVOICE_SETTINGS_COPY.notifyOnViewHelp}
                </p>
              </div>
              <Switch
                id="view-notify"
                checked={settings.notifyOnInvoiceView !== false}
                onCheckedChange={(v) => patch({ notifyOnInvoiceView: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="paid-notify">{INVOICE_SETTINGS_COPY.notifyOnPaid}</Label>
                <p className="text-sm text-muted-foreground">
                  {INVOICE_SETTINGS_COPY.notifyOnPaidHelp}
                </p>
              </div>
              <Switch
                id="paid-notify"
                checked={settings.notifyOnInvoicePaid !== false}
                onCheckedChange={(v) => patch({ notifyOnInvoicePaid: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="receipt-notify">{INVOICE_SETTINGS_COPY.sendReceipt}</Label>
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
