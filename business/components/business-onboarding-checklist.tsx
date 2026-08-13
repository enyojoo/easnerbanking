"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Check, ChevronDown, ChevronUp, CircleDashed, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { isBusinessInfoStepComplete } from "@/lib/business-tab-completion"
import { parseBalanceString } from "@/hooks/use-business-account-rows"
import { useWalletBalances } from "@/hooks/queries/use-wallets"
import { usePayrollOverview } from "@/hooks/queries/use-payroll"
import { ONBOARDING_STEP_COPY } from "@/lib/copy/business-ui-copy"
import { useMfaStatus } from "@/hooks/use-mfa-status"

type SnapshotBalances = { USD: string; EUR: string }

function hasPositiveFiat(b: SnapshotBalances | null): boolean {
  if (!b) return false
  return parseBalanceString(b.USD) > 0 || parseBalanceString(b.EUR) > 0
}

function tier1VerificationKind(
  tier1Complete: boolean,
  tier1VerificationStatus: string | null,
): "complete" | "rejected" | "review" | "unverified" {
  if (tier1Complete) return "complete"
  const s = (tier1VerificationStatus || "").toLowerCase()
  if (s === "rejected") return "rejected"
  if (s.includes("review") || s === "pending" || s === "in_review" || s === "under_review") return "review"
  return "unverified"
}

function ProgressRing({ pct }: { pct: number }) {
  const p = Math.min(100, Math.max(0, pct))
  const r = 7
  const c = 2 * Math.PI * r
  const dash = (p / 100) * c
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden>
      <circle cx="10" cy="10" r={r} fill="none" className="stroke-sidebar-border" strokeWidth="2.5" />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        className="stroke-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 10 10)"
      />
    </svg>
  )
}

type StepVisual = "complete" | "error" | "pending"

/**
 * Sidebar onboarding progress — driven only by the signed-in account's live
 * profile / payroll / wallet data (same isolation model as balances).
 * No sticky localStorage: that leaked completed steps across account switches.
 */
export function BusinessOnboardingChecklist() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const profile = useBusinessProfile()
  const walletQuery = useWalletBalances()
  const payrollOverviewQuery = usePayrollOverview()
  const [expanded, setExpanded] = useState(false)
  const walletReady = Boolean(walletQuery.isSuccess || walletQuery.isFetched)
  const funded =
    walletReady &&
    hasPositiveFiat(
      walletQuery.data?.balances
        ? {
            USD: String(walletQuery.data.balances.USD ?? "0"),
            EUR: String(walletQuery.data.balances.EUR ?? "0"),
          }
        : null,
    )

  // Drop legacy sticky progress keys that leaked completed steps across accounts.
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith("business_onboarding_steps_")) keys.push(key)
      }
      for (const key of keys) localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }, [])

  const step1Done = isBusinessInfoStepComplete(profile)
  const mfaStatus = useMfaStatus()
  const step2Done = mfaStatus.verified
  const step3Done = profile.tier1Complete
  const verifyKind = tier1VerificationKind(profile.tier1Complete, profile.tier1VerificationStatus)
  const payrollActiveCount = payrollOverviewQuery.data?.activeCount ?? 0
  const payrollNeedsReceiving = (payrollOverviewQuery.data?.needsDestinationCount ?? 0) > 0
  const payrollNeedsAttention = (payrollOverviewQuery.data?.attentionCount ?? 0) > 0
  /** Payroll settings default from base currency; step completes once someone is added and pay-ready. */
  const step4Done =
    payrollActiveCount >= 1 && !payrollNeedsReceiving && !payrollNeedsAttention
  const step5Done = profile.tier1Complete && funded

  const refreshBalances = useCallback(async () => {
    if (!userId) return
    await walletQuery.refetch()
  }, [userId, walletQuery])

  const refreshPayroll = useCallback(async () => {
    if (!userId) return
    await payrollOverviewQuery.refetch()
  }, [payrollOverviewQuery, userId])

  useEffect(() => {
    if (!userId) return
    void refreshBalances()
  }, [userId, refreshBalances, profile.tier1Complete])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshPayroll()
        void refreshBalances()
        mfaStatus.refresh({ force: true })
      }
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [mfaStatus.refresh, refreshBalances, refreshPayroll])

  useEffect(() => {
    const onAccounts = () => {
      void refreshBalances()
    }
    window.addEventListener("easner-business-accounts-refresh", onAccounts)
    return () => window.removeEventListener("easner-business-accounts-refresh", onAccounts)
  }, [refreshBalances])

  useEffect(() => {
    if (expanded) {
      void refreshPayroll()
      void refreshBalances()
      mfaStatus.refresh({ force: true })
    }
  }, [expanded, mfaStatus.refresh, refreshBalances, refreshPayroll])

  const completedCount = [step1Done, step2Done, step3Done, step4Done, step5Done].filter(Boolean).length
  const allDone = completedCount === 5
  const pct = Math.round((completedCount / 5) * 100)

  const step3Visual: StepVisual = step3Done ? "complete" : verifyKind === "rejected" ? "error" : "pending"

  const steps = useMemo(
    () => [
      {
        id: "business",
        title: "Finish business info",
        subtitle: step1Done
          ? ONBOARDING_STEP_COPY.businessComplete
          : ONBOARDING_STEP_COPY.businessPending,
        href: "/settings?tab=business",
        visual: step1Done ? ("complete" as const) : ("pending" as const),
      },
      {
        id: "mfa",
        title: "Set up 2FA",
        subtitle: step2Done ? ONBOARDING_STEP_COPY.mfaComplete : ONBOARDING_STEP_COPY.mfaPending,
        href: "/settings?tab=personal&setupMfa=1",
        visual: step2Done ? ("complete" as const) : ("pending" as const),
      },
      {
        id: "verify",
        title: "Verify your account",
        subtitle: step3Done
          ? ONBOARDING_STEP_COPY.verifyComplete
          : verifyKind === "rejected"
            ? ONBOARDING_STEP_COPY.verifyRejected
            : verifyKind === "review"
              ? ONBOARDING_STEP_COPY.verifyReview
              : ONBOARDING_STEP_COPY.verifyPending,
        href: "/settings?tab=verification",
        visual: step3Visual,
      },
      {
        id: "payroll",
        title: "Set up Payroll",
        subtitle: step4Done
          ? payrollActiveCount === 1
            ? "1 person ready for payroll"
            : `${payrollActiveCount} people ready for payroll`
          : payrollActiveCount >= 1
            ? ONBOARDING_STEP_COPY.payrollReceivingPending
            : ONBOARDING_STEP_COPY.payrollPending,
        href: "/payroll",
        visual: step4Done ? ("complete" as const) : ("pending" as const),
      },
      {
        id: "fund",
        title: "Fund your account",
        subtitle: !profile.tier1Complete
          ? ONBOARDING_STEP_COPY.fundAfterVerification
          : step5Done
            ? ONBOARDING_STEP_COPY.fundComplete
            : ONBOARDING_STEP_COPY.fundPending,
        href: "/accounts",
        visual: !profile.tier1Complete ? ("pending" as const) : step5Done ? ("complete" as const) : ("pending" as const),
      },
    ],
    [
      payrollActiveCount,
      profile.onboardingComplete,
      profile.tier1Complete,
      step1Done,
      step2Done,
      step3Done,
      step4Done,
      step5Done,
      verifyKind,
      step3Visual,
    ],
  )

  // Wait for this account's profile (and fund balances when verification unlocks funding).
  if (!userId || profile.isLoading || !profile.hasData) return null
  if (!mfaStatus.statusKnown) return null
  if (profile.tier1Complete && walletQuery.isPending && !walletQuery.data) return null
  if (allDone) return null

  return (
    <div className="border-t border-sidebar-border px-3 pb-2 pt-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className={cn(
          "flex w-full min-w-0 items-center justify-between gap-1.5 rounded-full border border-primary/35 bg-sidebar px-2 py-1.5 text-left font-medium leading-snug text-foreground shadow-sm transition-colors",
          "hover:bg-accent/50 focus-visible:outline-none",
        )}
      >
        <span className="min-w-0 flex-1 truncate pr-0.5 text-[13px]">Complete onboarding</span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-[11px] font-medium tabular-nums text-primary">{pct}%</span>
          <ProgressRing pct={pct} />
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg border border-sidebar-border bg-card p-2.5 shadow-sm">
          <div className="mb-2.5 flex items-start justify-between gap-2">
            <h2 className="min-w-0 flex-1 text-xs font-semibold leading-snug text-foreground">
              Complete your account setup
            </h2>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{completedCount}/5</span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {steps.map((step) => (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className={cn(
                  "flex gap-2.5 rounded-md p-1 -m-1 transition-colors hover:bg-accent/60 focus-visible:outline-none",
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {step.visual === "complete" ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white">
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      </span>
                    ) : step.visual === "error" ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                        <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      </span>
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground">
                        <CircleDashed className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold leading-snug text-foreground">{step.title}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{step.subtitle}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
