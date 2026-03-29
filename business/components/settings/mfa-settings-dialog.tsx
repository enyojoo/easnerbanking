"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Loader2, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { OtpCodeInput } from "@/components/otp-code-input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import {
  getVerifiedTotpFactorId,
  isDuplicateMfaFriendlyNameError,
  type TotpFactorLike,
  totpFactorsFromListResponse,
  unenrollUnverifiedTotpFactors,
} from "@/lib/auth-mfa"

interface MfaSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onFactorsChanged?: () => void
  /** From the settings card (last listFactors result) so the dialog can render CTAs without waiting. */
  initialTotpVerified?: boolean
  /** False while the parent is still fetching MFA status for the card. */
  mfaStatusKnown?: boolean
  /** When true (e.g. user tapped "Set up" on the card), open straight into the QR step and start enroll immediately. */
  autoStartEnroll?: boolean
}

type View = "list" | "enroll"

/** Passed to GoTrue as `issuer` — appears in the otpauth URI / authenticator app (e.g. “Easner Banking”). */
const MFA_TOTP_ISSUER = "Easner Banking"

/** Must match `duration-300` on `DialogOverlay` / `DialogContent` in `dialog.tsx`. */
const DIALOG_EXIT_ANIMATION_MS = 300

export function MfaSettingsDialog({
  open,
  onOpenChange,
  onFactorsChanged,
  initialTotpVerified = false,
  mfaStatusKnown = true,
  autoStartEnroll = false,
}: MfaSettingsDialogProps) {
  const [view, setView] = useState<View>("list")
  const [factors, setFactors] = useState<TotpFactorLike[]>([])
  const [error, setError] = useState<string | null>(null)

  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState("")
  /** Fetching QR / enroll from API — keep UI calm (no spinners on the card path). */
  const [enrollFetching, setEnrollFetching] = useState(false)
  const [verifySubmitting, setVerifySubmitting] = useState(false)
  /** Dedupes Strict Mode double layout + ignores stale enroll completions after reopen. */
  const enrollGenRef = useRef(0)
  const closeResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadFactors = useCallback(async (): Promise<TotpFactorLike[] | null> => {
    setError(null)
    try {
      const supabase = createSupabaseBrowser()
      const { data, error: listErr } = await supabase.auth.mfa.listFactors()
      if (listErr) {
        setError(listErr.message || "Could not load MFA status.")
        setFactors([])
        return null
      }
      const next = totpFactorsFromListResponse(data)
      setFactors(next)
      return next
    } catch {
      setError("Could not load MFA status.")
      setFactors([])
      return null
    }
  }, [])

  const startEnroll = useCallback(async (generation: number) => {
    setError(null)
    setEnrollFetching(true)
    try {
      const supabase = createSupabaseBrowser()
      await unenrollUnverifiedTotpFactors(supabase)

      const {
        data: { session },
      } = await supabase.auth.getSession()
      const email = session?.user?.email?.trim() ?? null
      const enrollParams = {
        factorType: "totp" as const,
        /** Shown in authenticator apps from the otpauth URI (replaces default project/site name). */
        issuer: MFA_TOTP_ISSUER,
        /** Stored on the factor and helps avoid duplicate-name clashes; email distinguishes accounts. */
        friendlyName: email ? `${MFA_TOTP_ISSUER} (${email})` : MFA_TOTP_ISSUER,
      }

      let { data, error: enErr } = await supabase.auth.mfa.enroll(enrollParams)
      if (enErr && isDuplicateMfaFriendlyNameError(enErr.message)) {
        await unenrollUnverifiedTotpFactors(supabase)
        const second = await supabase.auth.mfa.enroll(enrollParams)
        data = second.data
        enErr = second.error
      }
      if (generation !== enrollGenRef.current) return
      if (enErr || !data) {
        setError(enErr?.message || "Could not start enrollment. Is TOTP enabled in your project?")
        return
      }
      if (data.type !== "totp" || !data.totp) {
        setError("Unexpected response from the server.")
        return
      }
      const { qr_code, secret: sec } = data.totp
      const qrSrc = qr_code.startsWith("data:")
        ? qr_code
        : `data:image/svg+xml;utf-8,${encodeURIComponent(qr_code)}`
      setEnrollFactorId(data.id)
      setQrDataUrl(qrSrc)
      setSecret(sec ?? null)
      setView("enroll")
    } finally {
      if (generation === enrollGenRef.current) {
        setEnrollFetching(false)
      }
    }
  }, [])

  /**
   * Reset before paint; start enroll in the same turn (before paint) when opening from “Set up”
   * so the request is in flight immediately — no extra listFactors round-trip first.
   */
  useLayoutEffect(() => {
    if (!open) return
    enrollGenRef.current += 1
    const generation = enrollGenRef.current
    setEnrollFactorId(null)
    setQrDataUrl(null)
    setSecret(null)
    setVerifyCode("")
    setError(null)
    if (!autoStartEnroll) {
      setView("list")
      return
    }
    if (initialTotpVerified && mfaStatusKnown) {
      setView("list")
      return
    }
    setView("enroll")
    void loadFactors()
    void startEnroll(generation)
  }, [open, autoStartEnroll, initialTotpVerified, mfaStatusKnown, loadFactors, startEnroll])

  /** Open dialog without auto-start, or rare “card said On” edge: confirm factors from API. */
  useEffect(() => {
    if (!open) return
    if (!autoStartEnroll) {
      void loadFactors()
      return
    }
    if (!(initialTotpVerified && mfaStatusKnown)) return
    let cancelled = false
    void (async () => {
      const next = await loadFactors()
      if (cancelled) return
      if (next && getVerifiedTotpFactorId(next)) {
        setView("list")
        return
      }
      enrollGenRef.current += 1
      const generation = enrollGenRef.current
      void startEnroll(generation)
    })()
    return () => {
      cancelled = true
    }
  }, [open, autoStartEnroll, loadFactors, startEnroll, initialTotpVerified, mfaStatusKnown])

  const verifiedFactorId = getVerifiedTotpFactorId(factors)

  /** Verified in API, or parent card already shows “On” — render enrolled UI immediately (Turn off waits for factor id). */
  const showEnrolledCard =
    Boolean(verifiedFactorId) || (initialTotpVerified && mfaStatusKnown)

  /** Clear dialog content after the overlay/panel exit animation so the close feels smooth. */
  const scheduleDeferredUiReset = useCallback(() => {
    if (closeResetTimerRef.current) {
      clearTimeout(closeResetTimerRef.current)
      closeResetTimerRef.current = null
    }
    closeResetTimerRef.current = setTimeout(() => {
      closeResetTimerRef.current = null
      setView("list")
      setEnrollFactorId(null)
      setQrDataUrl(null)
      setSecret(null)
      setVerifyCode("")
      setError(null)
    }, DIALOG_EXIT_ANIMATION_MS)
  }, [])

  useEffect(() => {
    if (open && closeResetTimerRef.current) {
      clearTimeout(closeResetTimerRef.current)
      closeResetTimerRef.current = null
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (closeResetTimerRef.current) {
        clearTimeout(closeResetTimerRef.current)
        closeResetTimerRef.current = null
      }
    }
  }, [])

  const handleDialogOpenChange = (next: boolean) => {
    if (closeResetTimerRef.current) {
      clearTimeout(closeResetTimerRef.current)
      closeResetTimerRef.current = null
    }
    if (!next) {
      onOpenChange(false)
      const supabase = createSupabaseBrowser()
      void (async () => {
        await unenrollUnverifiedTotpFactors(supabase)
        await loadFactors()
        onFactorsChanged?.()
      })()
      scheduleDeferredUiReset()
      return
    }
    onOpenChange(next)
  }

  const completeEnroll = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!enrollFactorId) return
    const code = verifyCode.replace(/\D/g, "")
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.")
      return
    }
    setError(null)
    setVerifySubmitting(true)
    try {
      const supabase = createSupabaseBrowser()
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: enrollFactorId,
      })
      if (chErr || !ch?.id) {
        setError(chErr?.message || "Could not verify the code.")
        return
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: ch.id,
        code,
      })
      if (vErr) {
        setError(vErr.message || "Invalid code.")
        return
      }
      await loadFactors()
      onFactorsChanged?.()
      onOpenChange(false)
      scheduleDeferredUiReset()
    } finally {
      setVerifySubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Two-factor authentication
            </DialogTitle>
            <DialogDescription>
              {view === "enroll"
                ? "Scan this QR code to set up your account using your preferred authenticator app. Popular choices include Google Authenticator, Microsoft Authenticator, and Authy."
                : "Use an authenticator app for a second sign-in step after your password."}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {view === "list" && (
            <div className="space-y-4 py-2">
              {showEnrolledCard ? (
                <p className="text-sm text-muted-foreground py-1">
                  Two-factor authentication is already enabled for this account.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Two-factor authentication is off. Add an authenticator app to protect your account.
                  </p>
                  <Button
                    type="button"
                    className="min-w-[11.5rem]"
                    onClick={() => {
                      enrollGenRef.current += 1
                      void startEnroll(enrollGenRef.current)
                    }}
                    disabled={enrollFetching}
                  >
                    Set up
                  </Button>
                </>
              )}
            </div>
          )}

          {view === "enroll" && (
            <form onSubmit={(e) => void completeEnroll(e)} className="space-y-4 py-2">
              <div className="flex justify-center rounded-md border bg-white p-3">
                {qrDataUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="" width={192} height={192} className="h-48 w-48" />
                  </>
                ) : (
                  <Skeleton className="h-48 w-48 shrink-0" aria-hidden />
                )}
              </div>
              <div className="space-y-2">
                <Label>Secret key</Label>
                <div
                  className="rounded-md border bg-muted/40 p-3 text-xs leading-normal"
                  aria-busy={!secret}
                >
                  {secret ? (
                    <code className="block w-full break-all">{secret}</code>
                  ) : (
                    <Skeleton className="block h-[1lh] w-full rounded-sm" aria-hidden />
                  )}
                </div>
              </div>
              <div className={verifySubmitting ? "pointer-events-none opacity-80" : undefined}>
                <OtpCodeInput
                  id="mfa-verify-code"
                  label="6-digit code"
                  value={verifyCode}
                  onChange={setVerifyCode}
                  autoFocus
                  disabled={verifySubmitting || enrollFetching || !enrollFactorId}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void (async () => {
                      const supabase = createSupabaseBrowser()
                      await unenrollUnverifiedTotpFactors(supabase)
                      setView("list")
                      setEnrollFactorId(null)
                      setQrDataUrl(null)
                      setSecret(null)
                      setVerifyCode("")
                      setError(null)
                      await loadFactors()
                      onFactorsChanged?.()
                    })()
                  }}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="min-w-[11.5rem]"
                  disabled={verifySubmitting || enrollFetching || !enrollFactorId}
                >
                  {verifySubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Enabling…
                    </>
                  ) : (
                    "Enable"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
