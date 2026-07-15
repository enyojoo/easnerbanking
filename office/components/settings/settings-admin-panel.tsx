"use client"

import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Save, Edit, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/lib/supabase"
import { officeKeys } from "@/lib/query/keys"
import {
  useOfficeCurrencies,
  useOfficeSystemSettings,
  type OfficeSystemSetting,
} from "@/hooks/queries"
import { CurrencyFlag } from "@/components/flags"
import { PlatformControlTabShell } from "@/components/platform-control/platform-tab-shell"

interface SystemSetting extends OfficeSystemSetting {}

interface Currency {
  id: string
  code: string
  name: string
  symbol: string
  flag_svg: string
  status: string
  created_at: string
  updated_at: string
}

export type SettingsAdminSection = "platform"

const GLOBAL_CURRENCY_CONTROL_LABELS: Record<"USD" | "EUR" | "GBP" | "NGN", string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  NGN: "Nigerian Naira",
}

const SECTION_COPY: Record<SettingsAdminSection, { title: string }> = {
  platform: {
    title: "Platform",
  },
}

export function SettingsAdminPanel({ section }: { section?: SettingsAdminSection }) {
  const queryClient = useQueryClient()
  const settingsQuery = useOfficeSystemSettings()
  const fiatCurrenciesQuery = useOfficeCurrencies("fiat")
  const currencies = (fiatCurrenciesQuery.data ?? []) as Currency[]
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([])
  const [saving, setSaving] = useState(false)
  const [isEditingSecuritySettings, setIsEditingSecuritySettings] = useState(false)

  // Platform configuration derived from system settings
  const [platformConfig, setPlatformConfig] = useState({
    maintenanceMode: false,
    registrationEnabled: true,
    emailVerificationRequired: true,
  })

  // Security settings derived from system settings
  const [securitySettings, setSecuritySettings] = useState({
    sessionTimeout: 30,
    passwordMinLength: 8,
    maxLoginAttempts: 5,
    accountLockoutDuration: 15,
  })

  const [originalSecuritySettings, setOriginalSecuritySettings] = useState({
    sessionTimeout: 30,
    passwordMinLength: 8,
    maxLoginAttempts: 5,
    accountLockoutDuration: 15,
  })
  const [currencyControls, setCurrencyControls] = useState({
    USD: { available: true, active: true },
    EUR: { available: true, active: true },
    GBP: { available: false, active: true },
    NGN: { available: false, active: true },
  })

  const applySettingsFromRows = (settings: SystemSetting[]) => {
    setSystemSettings(settings)

    const newPlatformConfig = {
      maintenanceMode: false,
      registrationEnabled: true,
      emailVerificationRequired: true,
    }
    const newSecuritySettings = {
      sessionTimeout: 30,
      passwordMinLength: 8,
      maxLoginAttempts: 5,
      accountLockoutDuration: 15,
    }
    const newCurrencyControls = {
      USD: { available: true, active: true },
      EUR: { available: true, active: true },
      GBP: { available: false, active: true },
      NGN: { available: false, active: true },
    }

    settings.forEach((setting) => {
      switch (setting.key) {
        case "maintenance_mode":
          newPlatformConfig.maintenanceMode = setting.value === "true"
          break
        case "registration_enabled":
          newPlatformConfig.registrationEnabled = setting.value === "true"
          break
        case "email_verification_required":
          newPlatformConfig.emailVerificationRequired = setting.value === "true"
          break
        case "session_timeout":
          newSecuritySettings.sessionTimeout = Number.parseInt(setting.value)
          break
        case "password_min_length":
          newSecuritySettings.passwordMinLength = Number.parseInt(setting.value)
          break
        case "max_login_attempts":
          newSecuritySettings.maxLoginAttempts = Number.parseInt(setting.value)
          break
        case "account_lockout_duration":
          newSecuritySettings.accountLockoutDuration = Number.parseInt(setting.value)
          break
        case "currency_available_USD":
          newCurrencyControls.USD.available = setting.value === "true"
          break
        case "currency_active_USD":
          newCurrencyControls.USD.active = setting.value === "true"
          break
        case "currency_available_EUR":
          newCurrencyControls.EUR.available = setting.value === "true"
          break
        case "currency_active_EUR":
          newCurrencyControls.EUR.active = setting.value === "true"
          break
        case "currency_available_GBP":
          newCurrencyControls.GBP.available = setting.value === "true"
          break
        case "currency_active_GBP":
          newCurrencyControls.GBP.active = setting.value === "true"
          break
        case "currency_available_NGN":
          newCurrencyControls.NGN.available = setting.value === "true"
          break
        case "currency_active_NGN":
          newCurrencyControls.NGN.active = setting.value === "true"
          break
      }
    })

    setPlatformConfig(newPlatformConfig)
    setSecuritySettings(newSecuritySettings)
    setOriginalSecuritySettings(newSecuritySettings)
    setCurrencyControls(newCurrencyControls)
  }

  useEffect(() => {
    if (!settingsQuery.data) return
    applySettingsFromRows(settingsQuery.data as SystemSetting[])
  }, [settingsQuery.data])

  const refreshSystemSettings = async () => {
    await queryClient.invalidateQueries({ queryKey: officeKeys.systemSettings() })
  }

  const updateSystemSetting = async (key: string, value: any, dataType = "string", category = "platform") => {
    try {
      const { error } = await supabase.from("system_settings").upsert(
        {
          key,
          value: String(value),
          data_type: dataType,
          category,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "key",
        },
      )

      if (error) throw error
      console.log(`Setting ${key} updated successfully`)
    } catch (error) {
      console.error("Error updating system setting:", error)
      throw error
    }
  }

  const handlePlatformConfigChange = async (key: string, value: any) => {
    try {
      setPlatformConfig({ ...platformConfig, [key]: value })

      const settingKey = key.replace(/([A-Z])/g, "_$1").toLowerCase()
      await updateSystemSetting(settingKey, value, typeof value === "boolean" ? "boolean" : "string")
    } catch (error) {
      console.error("Error updating platform config:", error)
      // Revert the change if it failed
      setPlatformConfig(platformConfig)
    }
  }

  const handleCurrencyControlChange = async (
    code: "USD" | "EUR" | "GBP" | "NGN",
    field: "available" | "active",
    checked: boolean,
  ) => {
    const isDefault = code === "USD" || code === "EUR"
    if (isDefault && field === "available") return

    const next =
      field === "available"
        ? { ...currencyControls[code], available: checked, active: checked ? currencyControls[code].active : false }
        : { ...currencyControls[code], active: checked }

    setCurrencyControls((prev) => ({ ...prev, [code]: next }))

    try {
      await updateSystemSetting(`currency_available_${code}`, isDefault ? true : next.available, "boolean", "currency")
      await updateSystemSetting(`currency_active_${code}`, next.active, "boolean", "currency")
    } catch (error) {
      console.error("Error updating currency controls:", error)
      await refreshSystemSettings()
    }
  }

  const handleSecuritySettingsChange = (key: string, value: number) => {
    setSecuritySettings({ ...securitySettings, [key]: value })
  }

  const handleSaveSecuritySettings = async () => {
    setSaving(true)
    try {
      const updates = [
        { key: "session_timeout", value: securitySettings.sessionTimeout, data_type: "number" },
        { key: "password_min_length", value: securitySettings.passwordMinLength, data_type: "number" },
        { key: "max_login_attempts", value: securitySettings.maxLoginAttempts, data_type: "number" },
        { key: "account_lockout_duration", value: securitySettings.accountLockoutDuration, data_type: "number" },
      ]

      for (const update of updates) {
        await updateSystemSetting(update.key, update.value, update.data_type)
      }

      setOriginalSecuritySettings(securitySettings)
      setIsEditingSecuritySettings(false)
      console.log("Security settings saved successfully")
    } catch (error) {
      console.error("Error saving security settings:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelSecuritySettings = () => {
    setSecuritySettings(originalSecuritySettings)
    setIsEditingSecuritySettings(false)
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

  const headerCopy = section ? SECTION_COPY[section] : { title: "System Settings" }

  const balanceCurrencyControls = (
            <Card>
              <CardHeader>
        <CardTitle>Global Currency Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
                  {(["USD", "EUR", "GBP", "NGN"] as const).map((code) => {
                    const control = currencyControls[code]
                    const isDefault = code === "USD" || code === "EUR"
                    return (
                      <div key={code} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {renderCurrencyFlag(code)}
                  <p className="text-sm font-medium truncate">
                    {GLOBAL_CURRENCY_CONTROL_LABELS[code]}{" "}
                    <span className="text-muted-foreground text-xs font-mono">({code})</span>
                  </p>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={isDefault ? true : control.available}
                                disabled={isDefault}
                                onCheckedChange={(v) => handleCurrencyControlChange(code, "available", Boolean(v))}
                              />
                              <Label className="text-xs">Make available</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={control.active}
                                onCheckedChange={(v) => handleCurrencyControlChange(code, "active", v)}
                                disabled={!isDefault && !control.available}
                              />
                              <Label className="text-xs">Active</Label>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </CardContent>
            </Card>
  )

  const platformConfigBody = (
    <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
          <Label htmlFor="maintenance">Maintenance Mode</Label>
          <p className="text-sm text-gray-500">Enable to temporarily disable user access</p>
                  </div>
        <Switch
          id="maintenance"
          checked={platformConfig.maintenanceMode}
          onCheckedChange={(checked) => handlePlatformConfigChange("maintenanceMode", checked)}
        />
                                        </div>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="registration">Registration Enabled</Label>
          <p className="text-sm text-gray-500">Allow new user registrations</p>
                                      </div>
        <Switch
          id="registration"
          checked={platformConfig.registrationEnabled}
          onCheckedChange={(checked) => handlePlatformConfigChange("registrationEnabled", checked)}
                          />
                        </div>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="emailVerification">Email Verification Required</Label>
          <p className="text-sm text-gray-500">Require email verification for new accounts</p>
                              </div>
        <Switch
          id="emailVerification"
          checked={platformConfig.emailVerificationRequired}
          onCheckedChange={(checked) => handlePlatformConfigChange("emailVerificationRequired", checked)}
                                />
                              </div>
    </div>
  )

  const securityCard = (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Security Settings</CardTitle>
                  {!isEditingSecuritySettings && (
            <Button onClick={() => setIsEditingSecuritySettings(true)} className="bg-primary hover:bg-primary/90">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Settings
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                    <Input
                      id="sessionTimeout"
                      type="number"
                      value={securitySettings.sessionTimeout}
                      onChange={(e) => handleSecuritySettingsChange("sessionTimeout", Number(e.target.value))}
                      disabled={!isEditingSecuritySettings}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passwordLength">Password Min Length</Label>
                    <Input
                      id="passwordLength"
                      type="number"
                      value={securitySettings.passwordMinLength}
                      onChange={(e) => handleSecuritySettingsChange("passwordMinLength", Number(e.target.value))}
                      disabled={!isEditingSecuritySettings}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxAttempts">Max Login Attempts</Label>
                    <Input
                      id="maxAttempts"
                      type="number"
                      value={securitySettings.maxLoginAttempts}
                      onChange={(e) => handleSecuritySettingsChange("maxLoginAttempts", Number(e.target.value))}
                      disabled={!isEditingSecuritySettings}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lockoutDuration">Account Lockout Duration (minutes)</Label>
                    <Input
                      id="lockoutDuration"
                      type="number"
                      value={securitySettings.accountLockoutDuration}
                      onChange={(e) => handleSecuritySettingsChange("accountLockoutDuration", Number(e.target.value))}
                      disabled={!isEditingSecuritySettings}
                    />
                  </div>
                </div>

                {isEditingSecuritySettings && (
                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      onClick={handleCancelSecuritySettings}
                      className="flex-1 bg-transparent"
                      disabled={saving}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
            <Button onClick={handleSaveSecuritySettings} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? "Saving..." : "Save Security Settings"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
  )

  if (section === "platform") {
    return (
      <PlatformControlTabShell title={headerCopy.title}>
        <Card>
          <CardHeader>
            <CardTitle>Platform Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">{platformConfigBody}</CardContent>
        </Card>
        {balanceCurrencyControls}
        {securityCard}
      </PlatformControlTabShell>
    )
  }

  return null
}
