"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CreditCard } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { CheckoutFeeModeSelector } from "@/components/settings/checkout-fee-mode-selector"
import { PaymentsConnectionStatusCard } from "@/components/settings/payments-connection-status-card"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { SettingsTabIntro } from "@/components/settings/settings-tab-intro"
import { PaymentsSettingsPanelSkeleton } from "@/components/collections/collections-skeletons"
import {
  saveCheckoutSettings,
  useCheckoutSettings,
} from "@/hooks/use-checkout-settings"
import { useBusinessProfile, patchCachedBusinessProfile } from "@/lib/use-business-profile"
import { SETTINGS_CONNECT_FLOW_PARAM } from "@/lib/compliance/cutover-comms"
import {
  COLLECTIONS_COPY,
  PAYMENTS_SETTINGS_COPY,
  SETTINGS_TAB_COPY,
} from "@/lib/copy/business-ui-copy"
import type { CheckoutFeeMode } from "@/lib/stripe/checkout-fee-mode"
import { connectSetupChecklist } from "@/lib/stripe/connect-panel-ux"
import { readCachedConnectStatus } from "@/lib/stripe/connect-status-cache"

export function SettingsPaymentsTab() {
  const profile = useBusinessProfile()
  const { data: checkoutData, loading: checkoutLoading, error, refetch } = useCheckoutSettings()
  const [masterSaving, setMasterSaving] = useState(false)

  const masterEnabled =
    checkoutData?.settings.onlinePaymentsEnabled ?? profile.onlinePaymentsEnabled !== false
  const connectReady = checkoutData?.readiness.ready === true
  const showSkeleton = checkoutLoading && !checkoutData

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

  const chips = useMemo(() => {
    const next: string[] = []
    if (!masterEnabled) {
      next.push(PAYMENTS_SETTINGS_COPY.statusOff)
      return next
    }
    next.push(connectReady ? PAYMENTS_SETTINGS_COPY.statusReady : PAYMENTS_SETTINGS_COPY.statusSetup)
    if (checkoutData) {
      next.push(
        checkoutData.settings.liveModeEnabled
          ? COLLECTIONS_COPY.statusLive
          : COLLECTIONS_COPY.statusTest,
      )
      next.push(
        checkoutData.settings.webhookUrl && checkoutData.settings.webhookSecretLast4
          ? COLLECTIONS_COPY.statusWebhookOn
          : COLLECTIONS_COPY.statusWebhookOff,
      )
    }
    return next
  }, [checkoutData, connectReady, masterEnabled])

  return (
    <div className="space-y-6">
      <SettingsTabIntro
        title={SETTINGS_TAB_COPY.payments.title}
        description={SETTINGS_TAB_COPY.payments.intro}
        chips={chips}
      />

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

          {!masterEnabled ? (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              {PAYMENTS_SETTINGS_COPY.masterOffHint}
            </p>
          ) : !connectReady && !showSkeleton ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-muted-foreground">
                {checkoutData?.readiness.reason || PAYMENTS_SETTINGS_COPY.setupRequiredHint}
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
          ) : connectReady ? (
            <p className="text-sm text-muted-foreground">{PAYMENTS_SETTINGS_COPY.readyHint}</p>
          ) : null}
        </CardContent>
      </Card>

      {masterEnabled && error && !checkoutData ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-sm">
            <p className="text-destructive">{COLLECTIONS_COPY.loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              {COLLECTIONS_COPY.retry}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {masterEnabled && showSkeleton ? <PaymentsSettingsPanelSkeleton /> : null}

      {masterEnabled && !showSkeleton ? (
        <>
          <Card>
            <CardHeader>
              <SettingsCardHeader
                title={PAYMENTS_SETTINGS_COPY.feesTitle}
                description={PAYMENTS_SETTINGS_COPY.feesIntro}
              />
            </CardHeader>
            <CardContent>
              {checkoutData ? (
                <CheckoutFeeModeSelector
                  feeMode={checkoutData.settings.feeMode}
                  managedByEasner={checkoutData.settings.feeModeManagedByEasner}
                  onSelect={saveFeeMode}
                />
              ) : null}
            </CardContent>
          </Card>

          <PaymentsConnectionStatusCard />
        </>
      ) : null}
    </div>
  )
}
