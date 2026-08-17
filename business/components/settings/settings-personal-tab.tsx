"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  User,
  Mail,
  Phone,
  Calendar,
  Edit,
  X,
  Check,
  Key,
  Smartphone,
  Loader2,
  Lock,
  IdCard,
  FileText,
  Shield,
} from "lucide-react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"
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
  beginTotpEnrollment,
  getVerifiedTotpFactorId,
  hasEmailPasswordIdentity,
  type TotpEnrollSetup,
  totpFactorsFromListResponse,
} from "@/lib/auth-mfa"
import { useMfaStatus } from "@/hooks/use-mfa-status"
import { hasPin } from "@/lib/login-pin"
import { PinSettingsDialog } from "@/components/app-lock/pin-settings-dialog"
import { SETTINGS_INPUT_CLASS } from "@/lib/settings-control-surface"
import {
  formatMaskedIdForDisplay,
  formatVerifiedAddressDisplay,
  type VerifiedIdentityPayload,
} from "@easner/shared"
import { CountryFlag } from "@/components/flags"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { SETTINGS_CARD_COPY } from "@/lib/copy/business-ui-copy"
import { useBusinessProfile } from "@/lib/use-business-profile"

/** Aligns with personal settings store / dataCache freshness window. */
const PERSONAL_SETTINGS_CACHE_TTL_MS = 60 * 60 * 1000

type PersonalSettingsResponse = {
  personal: {
    fullName: string
    email: string
    phone: string
    dateOfBirth: string
    avatarUrl: string | null
    profileLocked?: boolean
    isOrgOwner?: boolean
    showPhoneAndDateOfBirth?: boolean
  }
  verifiedIdentity?: VerifiedIdentityPayload
  sessionRefreshSuggested?: boolean
}

export function SettingsPersonalTab() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const { tier1Complete } = useBusinessProfile()
  const supabase = useMemo(() => createSupabaseBrowser(), [])
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    avatarUrl: null as string | null,
  })
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false)
  const [mfaAutoStartEnroll, setMfaAutoStartEnroll] = useState(false)
  const [turnOffMfaOpen, setTurnOffMfaOpen] = useState(false)
  const [turnOffMfaSubmitting, setTurnOffMfaSubmitting] = useState(false)
  const [mfaSetupPreparing, setMfaSetupPreparing] = useState(false)
  const [initialMfaEnrollSetup, setInitialMfaEnrollSetup] = useState<TotpEnrollSetup | null>(null)
  const setupMfaHandledRef = useRef(false)
  const mfaStatus = useMfaStatus({ enrollDialogOpen: mfaDialogOpen })
  const { statusLine: mfaStatusLine, statusKnown: mfaStatusKnown, verified: mfaVerifiedOn, refresh: refreshMfaStatus } =
    mfaStatus
  const [pinSettingsOpen, setPinSettingsOpen] = useState(false)
  const [pinStatusVersion, setPinStatusVersion] = useState(0)
  const [hasAppPin, setHasAppPin] = useState(false)
  const { data: personalData, setData: setPersonalData, loading } = useCachedData<PersonalSettingsResponse>({
    enabled: Boolean(user?.id),
    cacheKey: user?.id ? CACHE_KEYS.PERSONAL_SETTINGS(user.id) : null,
    persistKey: user?.id ? `personal_settings_v2_${user.id}` : undefined,
    initialData: {
      personal: { fullName: "", email: "", phone: "", dateOfBirth: "", avatarUrl: null },
    },
    ttlMs: PERSONAL_SETTINGS_CACHE_TTL_MS,
    fetcher: async () => {
      const res = await fetchWithSession("/api/settings/personal")
      if (!res.ok) {
        const json = (await res.json().catch(() => ({ error: "Failed to load personal settings" }))) as { error?: string }
        throw new Error(json.error || "Failed to load personal settings")
      }
      return (await res.json()) as PersonalSettingsResponse
    },
  })

  useEffect(() => {
    if (!user?.id) {
      setHasAppPin(false)
      return
    }
    setHasAppPin(hasPin(user.id))
  }, [user?.id, pinStatusVersion])

  const canUsePassword = hasEmailPasswordIdentity(user)
  const profileLocked = personalData.personal.profileLocked ?? false
  const showPhoneAndDateOfBirth = personalData.personal.showPhoneAndDateOfBirth ?? true
  const verifiedIdentity = personalData.verifiedIdentity
  const showVerifiedIdentity = Boolean(tier1Complete && verifiedIdentity?.visible)
  const verifiedIdDisplay = formatMaskedIdForDisplay(verifiedIdentity?.idNumberMasked)
  const verifiedAddressDisplay = showVerifiedIdentity
    ? formatVerifiedAddressDisplay(verifiedIdentity)
    : ""
  const hasPersonalData = Boolean(
    personalData.personal.fullName ||
      personalData.personal.email ||
      personalData.personal.phone ||
      personalData.personal.dateOfBirth ||
      personalData.personal.avatarUrl,
  )
  const showPersonalSkeleton = loading && !hasPersonalData
  /** MFA row stays in the same loading pass as personal settings until both API + factors are ready. */
  const mfaRowLoading = (loading && !hasPersonalData) || !mfaStatusKnown

  const openMfaSetupFlow = useCallback(async () => {
    setMfaAutoStartEnroll(true)
    setMfaSetupPreparing(true)
    setInitialMfaEnrollSetup(null)
    try {
      const setup = await beginTotpEnrollment(supabase)
      setInitialMfaEnrollSetup(setup)
      setMfaDialogOpen(true)
    } catch {
      setInitialMfaEnrollSetup(null)
      setMfaDialogOpen(true)
    } finally {
      setMfaSetupPreparing(false)
    }
  }, [supabase])

  useEffect(() => {
    if (setupMfaHandledRef.current) return
    if (searchParams.get("setupMfa") !== "1") return
    if (!mfaStatusKnown || mfaVerifiedOn) return
    setupMfaHandledRef.current = true
    void openMfaSetupFlow()
    if (typeof window !== "undefined") {
      const next = new URLSearchParams(searchParams.toString())
      next.delete("setupMfa")
      const qs = next.toString()
      window.history.replaceState(null, "", qs ? `/settings?${qs}` : "/settings?tab=personal")
    }
  }, [mfaStatusKnown, mfaVerifiedOn, openMfaSetupFlow, searchParams])

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
        void fetch("/api/notifications/security-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertType: "mfa_disabled" }),
        }).catch(() => {})
        setTurnOffMfaOpen(false)
        void refreshMfaStatus({ force: true })
      }
    } finally {
      setTurnOffMfaSubmitting(false)
    }
  }

  useEffect(() => {
    const p = personalData.personal
    const next = {
      fullName: p.fullName || "",
      email: p.email || "",
      phone: p.phone || "",
      dateOfBirth: p.dateOfBirth || "",
      avatarUrl: p.avatarUrl ?? null,
    }
    setFormData((prev) => {
      if (
        prev.fullName === next.fullName &&
        prev.email === next.email &&
        prev.phone === next.phone &&
        prev.dateOfBirth === next.dateOfBirth &&
        prev.avatarUrl === next.avatarUrl
      ) {
        return prev
      }
      return next
    })
  }, [
    personalData.personal.fullName,
    personalData.personal.email,
    personalData.personal.phone,
    personalData.personal.dateOfBirth,
    personalData.personal.avatarUrl,
  ])

  const handleEdit = (section: string) => setEditingSection(section)
  const handleCancel = () => setEditingSection(null)
  const handleSave = async (_section: string) => {
    setSavingPersonal(true)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) return
      const payload: Record<string, unknown> = {
        fullName: formData.fullName,
        avatarUrl: formData.avatarUrl,
      }
      if (showPhoneAndDateOfBirth) {
        payload.phone = formData.phone
        payload.dateOfBirth = formData.dateOfBirth
      }
      const res = await fetchWithSession("/api/settings/personal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const next = (await res.json()) as PersonalSettingsResponse
        setPersonalData(next)
      }
      setEditingSection(null)
    } finally {
      setSavingPersonal(false)
    }
  }
  const handleInputChange = (field: string, value: string | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <IdCard className="h-5 w-5" aria-hidden />
                Personal Information
              </CardTitle>
            }
            description={SETTINGS_CARD_COPY.personalInfo}
            actions={
              showPersonalSkeleton ? (
                <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
              ) : editingSection === "personal" ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancel} disabled={savingPersonal}>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void handleSave("personal")} disabled={savingPersonal}>
                    {savingPersonal ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden />
                    )}
                    Save
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => handleEdit("personal")}>
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {showPersonalSkeleton ? (
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
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" aria-hidden />
              {showPersonalSkeleton ? (
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              ) : (
                <Input
                  id="fullName"
                  className={SETTINGS_INPUT_CLASS}
                  value={formData.fullName}
                  onChange={(e) => handleInputChange("fullName", e.target.value)}
                  disabled={profileLocked || editingSection !== "personal"}
                />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              {showPersonalSkeleton ? (
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              ) : (
                <Input
                  id="email"
                  className={SETTINGS_INPUT_CLASS}
                  type="email"
                  value={formData.email}
                  readOnly
                  disabled
                />
              )}
            </div>
          </div>
          {showPhoneAndDateOfBirth ? (
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {showPersonalSkeleton ? (
                  <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                ) : (
                  <Input
                    id="phone"
                    className={SETTINGS_INPUT_CLASS}
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    disabled={editingSection !== "personal"}
                  />
                )}
              </div>
            </div>
          ) : null}
          {showPhoneAndDateOfBirth ? (
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {showPersonalSkeleton ? (
                  <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                ) : (
                  <Input
                    id="dateOfBirth"
                    className={SETTINGS_INPUT_CLASS}
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                    disabled={profileLocked || editingSection !== "personal"}
                  />
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {tier1Complete && showVerifiedIdentity ? (
        <Card>
          <CardHeader>
            <SettingsCardHeader
              title={
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" aria-hidden />
                  Verified identity
                </CardTitle>
              }
              description="Provided during business verification"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {verifiedIdentity?.idType ? (
              <div className="space-y-2">
                <Label>Government ID</Label>
                <div className="flex items-center gap-2 text-sm">
                  {verifiedIdentity.issuingCountry?.code ? (
                    <CountryFlag code={verifiedIdentity.issuingCountry.code} size={20} />
                  ) : null}
                  <Input
                    className={SETTINGS_INPUT_CLASS}
                    readOnly
                    disabled
                    value={
                      [verifiedIdentity.idType, verifiedIdDisplay].filter(Boolean).join(" · ") || "—"
                    }
                  />
                </div>
              </div>
            ) : null}
            {verifiedAddressDisplay ? (
              <div className="space-y-2">
                <Label>Residential address</Label>
                <Input className={SETTINGS_INPUT_CLASS} readOnly disabled value={verifiedAddressDisplay} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <SettingsCardHeader
            title={
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" aria-hidden />
                Security Settings
              </CardTitle>
            }
            description={SETTINGS_CARD_COPY.security}
          />
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
              className="w-[5.75rem]"
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
                {mfaRowLoading ? (
                  <div className="mt-1 h-4 w-12 animate-pulse rounded bg-muted" aria-hidden />
                ) : (
                  <p className="text-sm text-muted-foreground">{mfaStatusLine}</p>
                )}
              </div>
            </div>
            <Button
              className="w-[5.75rem]"
              variant="outline"
              size="sm"
              disabled={mfaRowLoading || mfaSetupPreparing}
              onClick={() => {
                if (mfaVerifiedOn) {
                  setTurnOffMfaOpen(true)
                  return
                }
                void openMfaSetupFlow()
              }}
              aria-label={!mfaVerifiedOn && mfaSetupPreparing ? "Preparing MFA setup" : undefined}
            >
              {!mfaVerifiedOn && mfaSetupPreparing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : mfaVerifiedOn ? (
                "Disable"
              ) : (
                "Set up"
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">App PIN</p>
                <p className="text-sm text-muted-foreground">
                  {hasAppPin
                    ? "Use your PIN to unlock the app after idle time and confirm sensitive actions."
                    : "Your 4-digit PIN for quick login and more"}
                </p>
              </div>
            </div>
            <Button
              className="w-[5.75rem]"
              variant="outline"
              size="sm"
              onClick={() => setPinSettingsOpen(true)}
            >
              {hasAppPin ? "Change" : "Set up"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <PinSettingsDialog
        open={pinSettingsOpen}
        onOpenChange={setPinSettingsOpen}
        userId={user?.id ?? ""}
        onSaved={() => setPinStatusVersion((v) => v + 1)}
      />

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <MfaSettingsDialog
        open={mfaDialogOpen}
        onOpenChange={(o) => {
          setMfaDialogOpen(o)
          if (!o) {
            setMfaAutoStartEnroll(false)
            setInitialMfaEnrollSetup(null)
          }
        }}
        onFactorsChanged={() => void refreshMfaStatus({ force: true })}
        initialTotpVerified={mfaStatusLine === "On"}
        mfaStatusKnown={!mfaRowLoading}
        autoStartEnroll={mfaAutoStartEnroll}
        initialEnrollSetup={initialMfaEnrollSetup}
      />

      <AlertDialog open={turnOffMfaOpen} onOpenChange={setTurnOffMfaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
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
              Yes, Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
