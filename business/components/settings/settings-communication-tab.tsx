"use client"

import { useCallback, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Mail } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { CACHE_KEYS } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"
import type { CommunicationPreferences } from "@easner/shared"
import { DEFAULT_COMMUNICATION_PREFERENCES, COMMUNICATION_PREFERENCES_DISCLAIMER } from "@easner/shared"
import { toast } from "sonner"

const COMMUNICATION_SETTINGS_TTL_MS = 60 * 60 * 1000
const COMMUNICATION_SETTINGS_PERSIST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function SettingsCommunicationTab() {
  const { user, isLoading: authLoading } = useAuth()

  const {
    data: prefs,
    setData: setPrefs,
    loading,
  } = useCachedData<CommunicationPreferences>({
    enabled: Boolean(user?.id),
    cacheKey: user?.id ? CACHE_KEYS.COMMUNICATION_PREFERENCES(user.id) : null,
    persistKey: user?.id ? `communication_preferences_${user.id}` : undefined,
    initialData: DEFAULT_COMMUNICATION_PREFERENCES,
    ttlMs: COMMUNICATION_SETTINGS_TTL_MS,
    persistMaxAgeMs: COMMUNICATION_SETTINGS_PERSIST_MAX_AGE_MS,
    fetcher: useCallback(async () => {
      const res = await fetchWithSession("/api/settings/communication")
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || "Failed to load communication preferences")
      }
      const data = (await res.json()) as { preferences: CommunicationPreferences }
      return data.preferences
    }, []),
    onError: (e) => {
      console.error(e)
      toast.error(e instanceof Error ? e.message : "Could not load preferences")
    },
  })

  const patch = async (partial: Partial<CommunicationPreferences>) => {
    if (!prefs) return
    const optimistic: CommunicationPreferences = {
      ...prefs,
      ...partial,
      channels: partial.channels
        ? { ...prefs.channels, ...partial.channels }
        : prefs.channels,
    }
    setPrefs(optimistic)
    try {
      const res = await fetchWithSession("/api/settings/communication", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productUpdates: optimistic.productUpdates,
          securityAlerts: optimistic.securityAlerts,
          marketingEmails: optimistic.marketingEmails,
          channels: optimistic.channels,
        }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || res.statusText)
      }
      const data = (await res.json()) as { preferences: CommunicationPreferences }
      setPrefs(data.preferences)
    } catch (e) {
      // Keep user's chosen state in UI; follow-up refresh can reconcile.
      toast.error(e instanceof Error ? e.message : "Could not save")
    }
  }

  const hasPrefs = Boolean(prefs)
  const shouldShowSkeleton = authLoading || !user?.id || (loading && !hasPrefs)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Communication Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {shouldShowSkeleton ? (
            <div className="space-y-4">
              <div className="h-14 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-14 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-14 w-full animate-pulse rounded-md bg-muted" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Transaction and account emails to your inbox
                  </p>
                </div>
                <Switch
                  checked={prefs.channels.email}
                  onCheckedChange={(v) => patch({ channels: { ...prefs.channels, email: v } })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Product updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive emails about new features and improvements
                  </p>
                </div>
                <Switch
                  checked={prefs.productUpdates}
                  onCheckedChange={(v) => patch({ productUpdates: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Security alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified about important security updates
                  </p>
                </div>
                <Switch
                  checked={prefs.securityAlerts}
                  onCheckedChange={(v) => patch({ securityAlerts: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Marketing emails</Label>
                  <p className="text-sm text-muted-foreground">
                    News, tips, and promotional offers
                  </p>
                </div>
                <Switch
                  checked={prefs.marketingEmails}
                  onCheckedChange={(v) => patch({ marketingEmails: v })}
                />
              </div>
              <p className="text-sm text-muted-foreground">{COMMUNICATION_PREFERENCES_DISCLAIMER}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
