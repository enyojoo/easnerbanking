"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { User, Mail, Phone, Calendar, Edit, X, Check, Key, Smartphone } from "lucide-react"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import { personalSettingsStore } from "@/lib/personal-settings-store"
import { ProfilePhotoField } from "@/components/profile-photo-field"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ChangePasswordDialog } from "@/components/settings/change-password-dialog"
import { MfaSettingsDialog } from "@/components/settings/mfa-settings-dialog"
import {
  getVerifiedTotpFactorId,
  hasEmailPasswordIdentity,
  totpFactorsFromListResponse,
  unenrollUnverifiedTotpFactors,
} from "@/lib/auth-mfa"

/** Aligns with personal settings store / dataCache freshness window. */
const MFA_STATUS_CACHE_TTL_MS = 5 * 60 * 1000

export function SettingsPersonalTab() {
  const { user } = useAuth()
  const supabase = useMemo(() => createSupabaseBrowser(), [])
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    avatarUrl: null as string | null,
  })
  const mountedRef = useRef(true)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false)
  const [mfaAutoStartEnroll, setMfaAutoStartEnroll] = useState(false)
  const [turnOffMfaOpen, setTurnOffMfaOpen] = useState(false)
  const [turnOffMfaSubmitting, setTurnOffMfaSubmitting] = useState(false)
  const [mfaStatusLine, setMfaStatusLine] = useState<string>("")
  const mfaDialogOpenRef = useRef(false)

  const canUsePassword = hasEmailPasswordIdentity(user)
  const mfaVerifiedOn = mfaStatusLine === "On"

  useLayoutEffect(() => {
    mfaDialogOpenRef.current = mfaDialogOpen
  }, [mfaDialogOpen])

  const openMfaSetupFlow = () => {
    setMfaAutoStartEnroll(true)
    setMfaDialogOpen(true)
  }

  const confirmTurnOffMfa = async () => {
    setTurnOffMfaSubmitting(true)
    try {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) {
        setTurnOffMfaOpen(false)
        void refreshMfaStatus({ force: true })
        return
      }
      const totp = totpFactorsFromListResponse(data)
      const id = getVerifiedTotpFactorId(totp)
      if (!id) {
        setTurnOffMfaOpen(false)
        void refreshMfaStatus({ force: true })
        return
      }
      const { error: uErr } = await supabase.auth.mfa.unenroll({ factorId: id })
      if (!uErr) {
        setTurnOffMfaOpen(false)
        void refreshMfaStatus({ force: true })
      }
    } finally {
      setTurnOffMfaSubmitting(false)
    }
  }

  const refreshMfaStatus = useCallback((options?: { force?: boolean }) => {
    if (!user?.id) {
      setMfaStatusLine("")
      return
    }
    const key = CACHE_KEYS.MFA_SECURITY(user.id)
    if (!options?.force) {
      const cached = dataCache.get<{ statusLine: string }>(key)
      if (cached != null && !dataCache.isStale(key)) {
        setMfaStatusLine(cached.statusLine)
        return
      }
    }
    void (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      let statusLine: string
      if (error) {
        statusLine = "Unable to load status"
      } else {
        const totp = totpFactorsFromListResponse(data)
        const id = getVerifiedTotpFactorId(totp)
        if (id) {
          statusLine = "On"
        } else {
          if (totp.some((f) => f.status === "unverified") && !mfaDialogOpenRef.current) {
            await unenrollUnverifiedTotpFactors(supabase)
          }
          statusLine = "Off"
        }
      }
      dataCache.set(key, { statusLine }, MFA_STATUS_CACHE_TTL_MS)
      setMfaStatusLine(statusLine)
    })()
  }, [supabase, user?.id])

  useEffect(() => {
    if (!user?.id) {
      setMfaStatusLine("")
      return
    }
    void refreshMfaStatus()
  }, [user?.id, refreshMfaStatus])

  useLayoutEffect(() => {
    if (!user?.id) {
      setFormData({ fullName: "", email: "", phone: "", dateOfBirth: "", avatarUrl: null })
      setLoading(false)
      return
    }
    personalSettingsStore.hydrateSync(user.id)
    const d = personalSettingsStore.getData()
    if (d) {
      setFormData({
        fullName: d.personal.fullName,
        email: d.personal.email,
        phone: d.personal.phone,
        dateOfBirth: d.personal.dateOfBirth,
        avatarUrl: d.personal.avatarUrl ?? null,
      })
      setLoading(false)
    } else {
      setLoading(true)
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    mountedRef.current = true

    const initialize = async () => {
      try {
        await personalSettingsStore.initialize(user.id)
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }

    const unsubscribe = personalSettingsStore.subscribe(() => {
      if (!mountedRef.current) return
      const d = personalSettingsStore.getData()
      if (!d) return
      setFormData({
        fullName: d.personal.fullName,
        email: d.personal.email,
        phone: d.personal.phone,
        dateOfBirth: d.personal.dateOfBirth,
        avatarUrl: d.personal.avatarUrl ?? null,
      })
    })

    void initialize()
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [user?.id])

  const handleEdit = (section: string) => setEditingSection(section)
  const handleCancel = () => setEditingSection(null)
  const handleSave = async (section: string) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    await fetch("/api/settings/personal", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fullName: formData.fullName,
        phone: formData.phone,
        dateOfBirth: formData.dateOfBirth,
        avatarUrl: formData.avatarUrl,
      }),
    })
    if (user?.id) {
      personalSettingsStore.invalidate(user.id)
      await personalSettingsStore.initialize(user.id)
    }
    setEditingSection(null)
  }
  const handleInputChange = (field: string, value: string | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            {loading ? (
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            ) : editingSection === "personal" ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSave("personal")}>
                  <Check className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => handleEdit("personal")}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex gap-2">
              <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            </div>
          ) : (
            <ProfilePhotoField
              value={formData.avatarUrl}
              onChange={(v) => handleInputChange("avatarUrl", v)}
              disabled={editingSection !== "personal"}
            />
          )}
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            {loading ? (
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            ) : (
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => handleInputChange("fullName", e.target.value)}
                disabled={editingSection !== "personal"}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              {loading ? (
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              ) : (
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  readOnly
                  disabled
                />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {loading ? (
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              ) : (
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  disabled={editingSection !== "personal"}
                />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {loading ? (
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              ) : (
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                  disabled={editingSection !== "personal"}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">
                  {canUsePassword
                    ? "Use a strong password that you do not reuse elsewhere."
                    : "Password is managed by Google for this account."}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!canUsePassword}
              onClick={() => setChangePasswordOpen(true)}
            >
              Change
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">{mfaStatusLine || "—"}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => (mfaVerifiedOn ? setTurnOffMfaOpen(true) : openMfaSetupFlow())}
            >
              {mfaVerifiedOn ? "Turn off 2FA" : "Set up"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <MfaSettingsDialog
        open={mfaDialogOpen}
        onOpenChange={(o) => {
          setMfaDialogOpen(o)
          if (!o) setMfaAutoStartEnroll(false)
        }}
        onFactorsChanged={() => void refreshMfaStatus({ force: true })}
        initialTotpVerified={mfaStatusLine === "On"}
        mfaStatusKnown={Boolean(user?.id)}
        autoStartEnroll={mfaAutoStartEnroll}
      />

      <AlertDialog open={turnOffMfaOpen} onOpenChange={setTurnOffMfaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              You will only need your password to sign in. You can turn 2FA back on anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={turnOffMfaSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmTurnOffMfa()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
