"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import {
  readCachedConnectStatus,
  writeCachedConnectStatus,
  type CachedConnectStatus,
} from "@/lib/stripe/connect-status-cache"
import { resolveConnectPanelPhase } from "@/lib/stripe/connect-panel-ux"
import { TIER2_COMPLETE_PLACEHOLDER } from "@/lib/compliance-placeholders"

export function SettingsInvoicingTab() {
  const profile = useBusinessProfile()
  const [settings, setSettings] = useState<BusinessInvoiceSettings>({
    ...DEFAULT_INVOICE_PAYMENT_DEFAULTS,
  })
  const settingsRef = useRef(settings)
  const [connectReady, setConnectReady] = useState<boolean | null>(() => {
    const cached = readCachedConnectStatus(profile.businessId)
    if (!cached) return null
    return resolveConnectPanelPhase(cached) === "ready"
  })

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    if (profile.invoiceSettings) {
      setSettings({ ...DEFAULT_INVOICE_PAYMENT_DEFAULTS, ...profile.invoiceSettings })
    }
  }, [profile.invoiceSettings])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const cached = readCachedConnectStatus(profile.businessId)
      if (cached && !cancelled) {
        setConnectReady(resolveConnectPanelPhase(cached) === "ready")
      }
      try {
        const res = await fetchWithSession("/api/business/stripe/connect/status")
        const data = (await res.json().catch(() => ({}))) as Omit<CachedConnectStatus, "cachedAt">
        if (!res.ok || cancelled) return
        writeCachedConnectStatus(profile.businessId, data)
        setConnectReady(resolveConnectPanelPhase(data) === "ready")
      } catch {
        // keep cache / null
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [profile.businessId])

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

  const onlineIncomplete =
    settings.showOnlinePayment !== false && connectReady === false
  const bankIncomplete = settings.showBankTransfer && !TIER2_COMPLETE_PLACEHOLDER

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
              {bankIncomplete ? (
                <p className="text-xs text-muted-foreground mt-1">
                  <Link href="/settings?tab=verification" className="underline underline-offset-2">
                    {INVOICE_SETTINGS_COPY.finishBankTransfer}
                  </Link>
                </p>
              ) : null}
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
              <p className="text-xs text-muted-foreground mt-1">
                <Link href="/accounts" className="underline underline-offset-2">
                  {INVOICE_SETTINGS_COPY.finishStablecoin}
                </Link>
              </p>
            </div>
            <Switch
              id="show-stable"
              checked={settings.showStablecoin}
              onCheckedChange={(v) => patch({ showStablecoin: v })}
            />
          </div>
          <div className="space-y-2">
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
            {onlineIncomplete ? (
              <Alert>
                <AlertDescription className="text-sm">
                  <Link
                    href="/settings?tab=verification"
                    className="underline underline-offset-2 font-medium"
                  >
                    {INVOICE_SETTINGS_COPY.finishOnlinePayments}
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>{INVOICE_SETTINGS_COPY.defaultPaymentOption}</Label>
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
