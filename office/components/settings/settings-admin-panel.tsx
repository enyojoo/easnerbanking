"use client"

import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { officeKeys } from "@/lib/query/keys"
import { systemSettingsApi } from "@/lib/system-settings-api"
import {
  useOfficeCurrencies,
  useOfficeSystemSettings,
  type OfficeSystemSetting,
} from "@/hooks/queries"
import { CurrencyFlag } from "@/components/flags"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"

export type SettingsAdminSection = "platform"

const BASE_ACCOUNT_LABELS: Record<"USD" | "EUR", string> = {
  USD: "US Dollar",
  EUR: "Euro",
}

const SECTION_COPY: Record<SettingsAdminSection, { title: string }> = {
  platform: {
    title: "Platform",
  },
}

function settingBool(rows: OfficeSystemSetting[], key: string, fallback: boolean): boolean {
  const row = rows.find((r) => r.key === key)
  if (!row) return fallback
  return row.value === "true"
}

function settingString(rows: OfficeSystemSetting[], key: string, fallback: string): string {
  return rows.find((r) => r.key === key)?.value ?? fallback
}

function patchSettingRows(
  rows: OfficeSystemSetting[],
  key: string,
  value: string,
  dataType: string,
  category: string,
): OfficeSystemSetting[] {
  const now = new Date().toISOString()
  const existing = rows.find((r) => r.key === key)
  if (!existing) {
    return [
      ...rows,
      {
        id: key,
        key,
        value,
        data_type: dataType,
        category,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]
  }
  return rows.map((r) => (r.key === key ? { ...r, value, updated_at: now } : r))
}

export function SettingsAdminPanel({ section }: { section?: SettingsAdminSection }) {
  const queryClient = useQueryClient()
  const settingsQuery = useOfficeSystemSettings()
  const fiatCurrenciesQuery = useOfficeCurrencies("fiat")
  const currencies = fiatCurrenciesQuery.data ?? []
  const rows = settingsQuery.data ?? []
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const access = useMemo(
    () => ({
      maintenanceBusiness: settingBool(rows, "maintenance_mode_business", false),
      maintenancePersonal: settingBool(rows, "maintenance_mode_personal", false),
      registrationBusiness: settingBool(rows, "registration_enabled_business", true),
      registrationPersonal: settingBool(rows, "registration_enabled_personal", true),
      walletSendComplianceEnabled: settingBool(rows, "wallet_send_compliance_enabled", true),
      emailProvider: settingString(rows, "email_provider", "ses") === "sendgrid" ? "sendgrid" : "ses",
      minNativeVersionPersonal: settingString(rows, "min_native_version_personal", ""),
      usdActive: settingBool(rows, "currency_active_USD", true),
      eurActive: settingBool(rows, "currency_active_EUR", true),
    }),
    [rows],
  )

  const [minNativeDraft, setMinNativeDraft] = useState(access.minNativeVersionPersonal)

  useEffect(() => {
    setMinNativeDraft(access.minNativeVersionPersonal)
  }, [access.minNativeVersionPersonal])

  const persistMinNativeVersion = () => {
    const next = minNativeDraft.trim()
    if (next === access.minNativeVersionPersonal) return
    if (next && !/^\d+\.\d+(\.\d+)?$/.test(next)) {
      toast.error("Minimum app version must look like 1.10.2")
      setMinNativeDraft(access.minNativeVersionPersonal)
      return
    }
    void persistSetting("min_native_version_personal", next, "string", "platform")
  }

  const persistSetting = async (key: string, value: string | boolean, dataType: string, category: string) => {
    const previous = queryClient.getQueryData<OfficeSystemSetting[]>(officeKeys.systemSettings())
    const stringValue = String(value)
    queryClient.setQueryData<OfficeSystemSetting[]>(officeKeys.systemSettings(), (current) =>
      patchSettingRows(current ?? rows, key, stringValue, dataType, category),
    )
    setPendingKey(key)
    try {
      const saved = await systemSettingsApi.upsert([{ key, value }])
      if (saved.length) {
        queryClient.setQueryData<OfficeSystemSetting[]>(officeKeys.systemSettings(), (current) => {
          const next = [...(current ?? rows)]
          for (const row of saved) {
            const idx = next.findIndex((r) => r.key === row.key)
            if (idx === -1) next.push(row)
            else next[idx] = row
          }
          return next
        })
      }
      await queryClient.invalidateQueries({ queryKey: officeKeys.systemSettings(), refetchType: "active" })
    } catch (error) {
      if (previous) queryClient.setQueryData(officeKeys.systemSettings(), previous)
      toast.error(error instanceof Error ? error.message : "Could not save setting")
    } finally {
      setPendingKey(null)
    }
  }

  const renderCurrencyFlag = (currencyCode: string) => {
    const currency = currencies.find((c) => c.code === currencyCode)
    return (
      <CurrencyFlag
        currency={currencyCode}
        size={20}
        fallbackSvg={currency?.flag_svg?.trim() ? currency.flag_svg : undefined}
      />
    )
  }

  if (section !== "platform") return null

  return (
    <PlatformControlTabShell title={SECTION_COPY.platform.title}>
      <Card>
        <CardHeader>
          <CardTitle>Access</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-semibold">Business</p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="maintenance-business">Maintenance</Label>
                  <p className="text-sm text-gray-500">Temporarily disable Easner Business</p>
                </div>
                <Switch
                  id="maintenance-business"
                  checked={access.maintenanceBusiness}
                  disabled={pendingKey === "maintenance_mode_business"}
                  onCheckedChange={(checked) =>
                    void persistSetting("maintenance_mode_business", checked, "boolean", "platform")
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="registration-business">Registration</Label>
                  <p className="text-sm text-gray-500">Allow new Business sign-ups</p>
                </div>
                <Switch
                  id="registration-business"
                  checked={access.registrationBusiness}
                  disabled={pendingKey === "registration_enabled_business"}
                  onCheckedChange={(checked) =>
                    void persistSetting("registration_enabled_business", checked, "boolean", "platform")
                  }
                />
              </div>
            </div>
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-semibold">Mobile</p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="maintenance-mobile">Maintenance</Label>
                  <p className="text-sm text-gray-500">Temporarily disable the Easner app</p>
                </div>
                <Switch
                  id="maintenance-mobile"
                  checked={access.maintenancePersonal}
                  disabled={pendingKey === "maintenance_mode_personal"}
                  onCheckedChange={(checked) =>
                    void persistSetting("maintenance_mode_personal", checked, "boolean", "platform")
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="registration-mobile">Registration</Label>
                  <p className="text-sm text-gray-500">Allow new Mobile sign-ups</p>
                </div>
                <Switch
                  id="registration-mobile"
                  checked={access.registrationPersonal}
                  disabled={pendingKey === "registration_enabled_personal"}
                  onCheckedChange={(checked) =>
                    void persistSetting("registration_enabled_personal", checked, "boolean", "platform")
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min-native-mobile">Minimum app version</Label>
                <p className="text-sm text-gray-500">
                  Block older native binaries with an Update required screen. Leave blank to skip.
                </p>
                <Input
                  id="min-native-mobile"
                  value={minNativeDraft}
                  placeholder="1.10.2"
                  disabled={pendingKey === "min_native_version_personal"}
                  onChange={(event) => setMinNativeDraft(event.target.value)}
                  onBlur={persistMinNativeVersion}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur()
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="walletSendCompliance">Outbound send compliance</Label>
              <p className="text-sm text-gray-500">
                Daily send limits and velocity controls on business wallet payouts (stablecoin and fiat)
              </p>
            </div>
            <Switch
              id="walletSendCompliance"
              checked={access.walletSendComplianceEnabled}
              disabled={pendingKey === "wallet_send_compliance_enabled"}
              onCheckedChange={(checked) =>
                void persistSetting("wallet_send_compliance_enabled", checked, "boolean", "platform")
              }
            />
          </div>
          <div className="flex items-center justify-between gap-6">
            <div>
              <Label htmlFor="emailProvider">Email provider</Label>
              <p className="text-sm text-gray-500">
                Transactional mail backend. SES is default; switch to SendGrid only as fallback.
              </p>
            </div>
            <Select
              value={access.emailProvider}
              disabled={pendingKey === "email_provider"}
              onValueChange={(value) => void persistSetting("email_provider", value, "string", "platform")}
            >
              <SelectTrigger id="emailProvider" className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ses">AWS SES</SelectItem>
                <SelectItem value="sendgrid">SendGrid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Base accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["USD", "EUR"] as const).map((code) => {
            const active = code === "USD" ? access.usdActive : access.eurActive
            const key = `currency_active_${code}`
            return (
              <div key={code} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {renderCurrencyFlag(code)}
                    <p className="truncate text-sm font-medium">
                      {BASE_ACCOUNT_LABELS[code]}{" "}
                      <span className="font-mono text-xs text-muted-foreground">({code})</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={active}
                      disabled={pendingKey === key}
                      onCheckedChange={(checked) => void persistSetting(key, checked, "boolean", "currency")}
                    />
                    <Label className="text-xs">Active</Label>
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </PlatformControlTabShell>
  )
}
