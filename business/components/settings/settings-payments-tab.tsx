"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { CreditCard, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { CheckoutFeeModeSelector } from "@/components/settings/checkout-fee-mode-selector"
import { PaymentsConnectionStatusCard } from "@/components/settings/payments-connection-status-card"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import {
  saveCheckoutSettings,
  useCheckoutSettings,
} from "@/hooks/use-checkout-settings"
import { useBusinessProfile, patchCachedBusinessProfile, type BusinessProfile } from "@/lib/use-business-profile"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  DEFAULT_INVOICE_PAYMENT_DEFAULTS,
  type BusinessInvoiceSettings,
} from "@/lib/invoices/invoice-settings"
import { SETTINGS_CONNECT_FLOW_PARAM } from "@/lib/compliance/cutover-comms"
import {
  PAYMENTS_SETTINGS_COPY,
  SETTINGS_TAB_COPY,
} from "@/lib/copy/business-ui-copy"
import type { CheckoutFeeMode } from "@/lib/stripe/checkout-fee-mode"
import { connectSetupChecklist } from "@/lib/stripe/connect-panel-ux"
import { readCachedConnectStatus } from "@/lib/stripe/connect-status-cache"

export function SettingsPaymentsTab() {
  const profile = useBusinessProfile()
  const { data: checkoutData, loading: checkoutLoading, refetch } = useCheckoutSettings()
  const [masterSaving, setMasterSaving] = useState(false)
  const [invoiceSettings, setInvoiceSettings] = useState<BusinessInvoiceSettings>({
    ...DEFAULT_INVOICE_PAYMENT_DEFAULTS,
    ...profile.invoiceSettings,
  })
  const invoiceRef = useRef(invoiceSettings)

  useEffect(() => {
    invoiceRef.current = invoiceSettings
  }, [invoiceSettings])

  useEffect(() => {
    if (profile.invoiceSettings) {
      setInvoiceSettings({ ...DEFAULT_INVOICE_PAYMENT_DEFAULTS, ...profile.invoiceSettings })
    }
  }, [profile.invoiceSettings])

  const masterEnabled = checkoutData?.settings.onlinePaymentsEnabled !== false
  const connectReady = checkoutData?.readiness.ready === true

  const persistInvoiceSettings = useCallback(async (next: BusinessInvoiceSettings) => {
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
      toast.error(e instanceof Error ? e.message : "Could not save invoice settings")
      return false
    }
  }, [])

  const patchInvoice = useCallback(
    (partial: Partial<BusinessInvoiceSettings>) => {
      const optimistic = { ...invoiceRef.current, ...partial }
      setInvoiceSettings(optimistic)
      void persistInvoiceSettings(optimistic)
    },
    [persistInvoiceSettings],
  )

  const setMasterEnabled = async (enabled: boolean) => {
    setMasterSaving(true)
    try {
      const result = await saveCheckoutSettings({ online_payments_enabled: enabled })
      if (!result.ok) {
        toast.error(result.error || "Could not save")
        return
      }
      patchCachedBusinessProfile({ onlinePaymentsEnabled: enabled })
      toast.success(enabled ? "Online payments turned on." : "Online payments turned off.")
      await refetch()
    } finally {
      setMasterSaving(false)
    }
  }

  const saveFeeMode = async (mode: CheckoutFeeMode) => {
    const result = await saveCheckoutSettings({ fee_mode: mode })
    if (!result.ok) {
      toast.error(result.error || "Could not save")
      throw new Error(result.error || "Could not save")
    }
    toast.success("Saved.")
    await refetch()
  }

  const cachedConnect = readCachedConnectStatus(profile.businessId)
  const checklist = cachedConnect ? connectSetupChecklist(cachedConnect) : []
  const pendingItems = checklist.filter((item) => !item.done)

  let statusLabel = "Turned off"
  let statusVariant: "default" | "secondary" | "outline" = "secondary"
  if (masterEnabled) {
    if (connectReady) {
      statusLabel = "Ready"
      statusVariant = "default"
    } else {
      statusLabel = "Setup required"
      statusVariant = "outline"
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{SETTINGS_TAB_COPY.payments.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{SETTINGS_TAB_COPY.payments.intro}</p>
      </div>

      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {PAYMENTS_SETTINGS_COPY.masterTitle}
              </CardTitle>
            }
            description={PAYMENTS_SETTINGS_COPY.masterIntro}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="online-payments-master">{PAYMENTS_SETTINGS_COPY.masterSwitch}</Label>
              <p className="text-sm text-muted-foreground">{PAYMENTS_SETTINGS_COPY.masterSwitchHelp}</p>
            </div>
            <Switch
              id="online-payments-master"
              checked={masterEnabled}
              disabled={checkoutLoading || masterSaving}
              onCheckedChange={(v) => void setMasterEnabled(v)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>

          {!masterEnabled ? (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              {PAYMENTS_SETTINGS_COPY.masterOffHint}
            </p>
          ) : !connectReady ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-muted-foreground">
                {checkoutData?.readiness.reason ||
                  PAYMENTS_SETTINGS_COPY.setupRequiredHint}
              </p>
              {pendingItems.length > 0 ? (
                <ul className="space-y-1 text-muted-foreground">
                  {pendingItems.slice(0, 4).map((item) => (
                    <li key={item.label}>· {item.label}</li>
                  ))}
                </ul>
              ) : null}
              <Button asChild size="sm">
                <Link href={`/settings?tab=verification&flow=${SETTINGS_CONNECT_FLOW_PARAM}`}>
                  {PAYMENTS_SETTINGS_COPY.continueVerification}
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{PAYMENTS_SETTINGS_COPY.readyHint}</p>
          )}
        </CardContent>
      </Card>

      {masterEnabled ? (
        <>
          <Card>
            <CardHeader>
              <SettingsCardHeader
                title={PAYMENTS_SETTINGS_COPY.feesTitle}
                description={PAYMENTS_SETTINGS_COPY.feesIntro}
              />
            </CardHeader>
            <CardContent>
              {checkoutLoading || !checkoutData ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <CheckoutFeeModeSelector
                  feeMode={checkoutData.settings.feeMode}
                  managedByEasner={checkoutData.settings.feeModeManagedByEasner}
                  onSelect={saveFeeMode}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SettingsCardHeader
                title={PAYMENTS_SETTINGS_COPY.surfacesTitle}
                description={PAYMENTS_SETTINGS_COPY.surfacesIntro}
              />
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="invoice-pay-online">{PAYMENTS_SETTINGS_COPY.invoiceSurface}</Label>
                  <p className="text-sm text-muted-foreground">
                    {PAYMENTS_SETTINGS_COPY.invoiceSurfaceHelp}
                  </p>
                </div>
                <Switch
                  id="invoice-pay-online"
                  checked={invoiceSettings.showOnlinePayment !== false}
                  onCheckedChange={(v) => patchInvoice({ showOnlinePayment: v })}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">{PAYMENTS_SETTINGS_COPY.linksSurface}</p>
                  <p className="text-sm text-muted-foreground">
                    {connectReady
                      ? PAYMENTS_SETTINGS_COPY.linksSurfaceReady
                      : PAYMENTS_SETTINGS_COPY.linksSurfacePending}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/links">{PAYMENTS_SETTINGS_COPY.openLinks}</Link>
                </Button>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">{PAYMENTS_SETTINGS_COPY.checkoutSurface}</p>
                  <p className="text-sm text-muted-foreground">
                    {checkoutData?.settings.webhookUrl && checkoutData.settings.webhookSecretLast4
                      ? PAYMENTS_SETTINGS_COPY.checkoutWebhookConfigured
                      : PAYMENTS_SETTINGS_COPY.checkoutWebhookPending}
                    {checkoutData?.settings.liveModeEnabled
                      ? ` · ${PAYMENTS_SETTINGS_COPY.checkoutLiveOn}`
                      : ` · ${PAYMENTS_SETTINGS_COPY.checkoutTestMode}`}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/checkout" className="inline-flex items-center gap-1">
                    {PAYMENTS_SETTINGS_COPY.openCheckoutHub}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <PaymentsConnectionStatusCard />
        </>
      ) : null}
    </div>
  )
}
