"use client"

/**
 * Hosted KYB opens in a dialog iframe. Users close via the dialog’s built-in control.
 *
 * B2B parity: uses the same `/api/noah/kyc-links` + Easner context headers as consumer flows;
 * Tier state is driven by org `noah_kyb_status` via `useBusinessProfile` (see `/api/business/profile`).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BUSINESS_TIER_LADDER } from "@/lib/compliance-tier-ladder-copy"
import { cn } from "@/lib/utils"

function formatTier1Status(status: string | null): string {
  if (!status) return "Not started"
  const s = status.replace(/_/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function tierLadderCopy(tier: 1 | 2 | 3) {
  return BUSINESS_TIER_LADDER.tiers.find((x) => x.tier === tier)
}

export function BusinessVerificationSection() {
  const {
    tier1Complete,
    tier1VerificationStatus,
    canManageBusinessVerification,
    isLoading,
    businessId,
  } = useBusinessProfile()

  const [busy, setBusy] = useState<null | "link">(null)
  const [error, setError] = useState<string | null>(null)
  const [hostedOpen, setHostedOpen] = useState(false)
  const [hostedUrl, setHostedUrl] = useState<string | null>(null)
  /** Which tier the hosted iframe session is for (only Tier 1 today; same header pattern for future tiers). */
  const [hostedTierLevel, setHostedTierLevel] = useState<1 | 2 | 3>(1)
  /** Clear iframe after Radix exit animation so the dialog can close smoothly (iframe unmount is heavy). */
  const clearUrlAfterCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (clearUrlAfterCloseRef.current) clearTimeout(clearUrlAfterCloseRef.current)
    }
  }, [])

  const openHostedVerification = useCallback(async () => {
    setError(null)
    setBusy("link")
    try {
      const supabase = createSupabaseBrowser()
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setError("You need to be signed in.")
        return
      }
      const res = await fetchWithSession("/api/noah/kyc-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "business" }),
      })
      const text = await res.text()
      let json = {} as { kyc_link?: string; error?: string }
      if (text) {
        try {
          json = JSON.parse(text) as { kyc_link?: string; error?: string }
        } catch {
          setError(res.status === 431 ? "Request headers too large. Sign out, sign in again, or clear site data for localhost." : "Invalid response from server.")
          return
        }
      }
      if (res.status === 431) {
        setError(
          json.error ??
            "Session data is too large (often from a profile image stored in your account). Sign out and sign in again, or visit Personal settings after we refresh your session.",
        )
        return
      }
      if (!res.ok || !json.kyc_link) {
        setError(json.error ?? "Could not start verification.")
        return
      }
      if (clearUrlAfterCloseRef.current) {
        clearTimeout(clearUrlAfterCloseRef.current)
        clearUrlAfterCloseRef.current = null
      }
      setHostedTierLevel(1)
      setHostedUrl(json.kyc_link)
      setHostedOpen(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setBusy(null)
    }
  }, [])

  /** POST /api/noah/sync-status (business scope). Silent on failure — webhooks also update Tier 1. */
  const syncBusinessTier1FromNoah = useCallback(async (): Promise<boolean> => {
    try {
      const supabase = createSupabaseBrowser()
      const { data } = await supabase.auth.getSession()
      if (!data.session) return false
      const res = await fetchWithSession("/api/noah/sync-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Easner-Noah-Scope": "business",
        },
      })
      const text = await res.text()
      if (!res.ok) return false
      if (text) {
        try {
          JSON.parse(text)
        } catch {
          return false
        }
      }
      window.dispatchEvent(new Event("business-profile-updated"))
      return true
    } catch {
      return false
    }
  }, [])

  const lastAutoSyncMsRef = useRef(0)

  /** Auto-sync Tier 1 when the section is relevant (webhook / hosted-return complement). */
  useEffect(() => {
    if (isLoading || !businessId || !canManageBusinessVerification || tier1Complete) return

      const now = Date.now()
      const MIN_MS = 90_000
      if (now - lastAutoSyncMsRef.current < MIN_MS) return
      lastAutoSyncMsRef.current = now

      void syncBusinessTier1FromNoah()
  }, [
    isLoading,
    businessId,
    canManageBusinessVerification,
    tier1Complete,
    syncBusinessTier1FromNoah,
  ])

  /** While Tier 1 is incomplete, poll Noah occasionally (sandbox / missed webhooks). */
  useEffect(() => {
    if (!businessId || !canManageBusinessVerification || tier1Complete) return
    const id = window.setInterval(() => {
      void syncBusinessTier1FromNoah()
    }, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [businessId, canManageBusinessVerification, tier1Complete, syncBusinessTier1FromNoah])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading verification status…</div>
  }

  const hostedTierMeta = tierLadderCopy(hostedTierLevel)
  const hostedTierTitle = hostedTierMeta?.title ?? `Tier ${hostedTierLevel}`

  return (
    <div className="space-y-6" id="business-verification">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Compliance & verification</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tier 1 unlocks global banking for your organization once business verification is approved.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {BUSINESS_TIER_LADDER.tiers.map((t) => {
          const isT1 = t.tier === 1
          return (
            <Card
              key={t.tier}
              className={cn(isT1 && "border-primary/25 md:border-primary/40")}
            >
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{t.title}</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    Tier {t.tier}
                  </Badge>
                  {isT1 && tier1Complete ? (
                    <Badge className="bg-green-600 hover:bg-green-600">Approved</Badge>
                  ) : isT1 ? (
                    <Badge variant="secondary">{formatTier1Status(tier1VerificationStatus)}</Badge>
                  ) : (
                    <Badge variant="secondary">Coming later</Badge>
                  )}
                </div>
                <CardDescription className="text-sm text-foreground/85">{t.description}</CardDescription>
                {t.footnote ? (
                  <p className="text-xs text-muted-foreground pt-1">{t.footnote}</p>
                ) : null}
              </CardHeader>
              {isT1 ? (
                <CardContent className="space-y-4 pt-0">
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  {!businessId ? (
                    <p className="text-xs text-muted-foreground">Create or join an organization to continue.</p>
                  ) : null}
                  {!canManageBusinessVerification ? (
                    <p className="text-sm text-muted-foreground">
                      Only an organization owner can start hosted business verification. Ask an owner to complete
                      verification.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {canManageBusinessVerification && !tier1Complete ? (
                      <Button size="sm" onClick={() => void openHostedVerification()} disabled={busy !== null}>
                        {busy === "link" ? "Opening…" : "Begin verification"}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              ) : null}
            </Card>
          )
        })}
      </div>

      <Dialog
        open={hostedOpen}
        onOpenChange={(open) => {
          if (open) {
            if (clearUrlAfterCloseRef.current) {
              clearTimeout(clearUrlAfterCloseRef.current)
              clearUrlAfterCloseRef.current = null
            }
            setHostedOpen(true)
            return
          }
          setHostedOpen(false)
          void syncBusinessTier1FromNoah()
          if (clearUrlAfterCloseRef.current) clearTimeout(clearUrlAfterCloseRef.current)
          clearUrlAfterCloseRef.current = setTimeout(() => {
            setHostedUrl(null)
            clearUrlAfterCloseRef.current = null
          }, 280)
        }}
      >
        <DialogContent
          showCloseButton
          className="flex max-h-[90vh] w-[min(100vw-2rem,56rem)] flex-col gap-0 overflow-hidden p-0 duration-300 data-[state=open]:duration-300 data-[state=closed]:duration-300 sm:max-w-[56rem]"
        >
          <DialogHeader className="border-b px-6 py-4 pr-12">
            <div className="flex flex-wrap items-center gap-2 gap-y-1">
              <DialogTitle className="text-left text-base leading-snug sm:text-lg">
                Business verification for {hostedTierTitle}
              </DialogTitle>
              <Badge variant="outline" className="shrink-0 text-xs">
                Tier {hostedTierLevel}
              </Badge>
            </div>
            <DialogDescription className="pt-1">
              Complete the steps in the provider window below.
            </DialogDescription>
          </DialogHeader>
          {hostedUrl ? (
            <div className="relative min-h-[min(70vh,560px)] flex-1 bg-muted/30">
              <iframe
                title={`Business verification for ${hostedTierTitle} (Tier ${hostedTierLevel})`}
                src={hostedUrl}
                className="h-full min-h-[min(70vh,560px)] w-full border-0"
                allow="payment *; publickey-credentials-get *"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
