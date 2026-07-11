"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Check, ChevronDown, ChevronUp, CircleDashed, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { isBusinessInfoStepComplete } from "@/lib/business-tab-completion"
import { parseBalanceString } from "@/hooks/use-business-account-rows"
import { EASNER_TERMINAL_PAYOUT_SETUP_UPDATED_EVENT } from "@/lib/cache"
import { useTerminalPayoutSetupCached } from "@/hooks/use-terminal-payout-setup-cached"
import { useWalletBalances } from "@/hooks/queries/use-wallets"

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
 * profile / terminal / wallet data (same isolation model as balances).
 * No sticky localStorage: that leaked completed steps across account switches.
 */
export function BusinessOnboardingChecklist() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const profile = useBusinessProfile()
  const walletQuery = useWalletBalances()
  const { data: terminalSetup, refetch: refetchTerminalSetup } = useTerminalPayoutSetupCached()
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
  const step2Done = profile.tier1Complete
  const verifyKind = tier1VerificationKind(profile.tier1Complete, profile.tier1VerificationStatus)
  /** Done when external default payout is set, or Easner balance settlement with USD/EUR chosen. */
  const step3Done = Boolean(
    userId &&
      (terminalSetup.defaultTerminalPayoutId ||
        (terminalSetup.settlementDestination === "easner_balance" &&
          (terminalSetup.defaultBalanceCurrency === "USD" ||
            terminalSetup.defaultBalanceCurrency === "EUR"))),
  )
  const step4Done = profile.tier1Complete && funded

  const refreshBalances = useCallback(async () => {
    if (!userId) return
    await walletQuery.refetch()
  }, [userId, walletQuery])

  const refreshTerminal = useCallback(async () => {
    if (!userId) return
    await refetchTerminalSetup()
  }, [refetchTerminalSetup, userId])

  useEffect(() => {
    if (!userId) return
    void refreshBalances()
  }, [userId, refreshBalances, profile.tier1Complete])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshTerminal()
        void refreshBalances()
      }
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [refreshBalances, refreshTerminal])

  useEffect(() => {
    const onAccounts = () => {
      void refreshBalances()
    }
    window.addEventListener("easner-business-accounts-refresh", onAccounts)
    return () => window.removeEventListener("easner-business-accounts-refresh", onAccounts)
  }, [refreshBalances])

  useEffect(() => {
    const onProfile = () => {
      void refreshTerminal()
    }
    window.addEventListener("business-profile-updated", onProfile)
    return () => window.removeEventListener("business-profile-updated", onProfile)
  }, [refreshTerminal])

  useEffect(() => {
    const onTerminalUpdated = () => {
      void refreshTerminal()
    }
    window.addEventListener(EASNER_TERMINAL_PAYOUT_SETUP_UPDATED_EVENT, onTerminalUpdated)
    return () => window.removeEventListener(EASNER_TERMINAL_PAYOUT_SETUP_UPDATED_EVENT, onTerminalUpdated)
  }, [refreshTerminal])

  useEffect(() => {
    if (expanded) {
      void refreshTerminal()
      void refreshBalances()
    }
  }, [expanded, refreshBalances, refreshTerminal])

  const completedCount = [step1Done, step2Done, step3Done, step4Done].filter(Boolean).length
  const allDone = completedCount === 4
  const pct = Math.round((completedCount / 4) * 100)

  const step2Visual: StepVisual = step2Done ? "complete" : verifyKind === "rejected" ? "error" : "pending"

  const steps = useMemo(
    () => [
      {
        id: "business",
        title: "Finish business info",
        subtitle: !profile.onboardingComplete
          ? "Complete onboarding details"
          : !step1Done
            ? "Fill in all Business settings"
            : "Business profile complete",
        href: "/settings?tab=business",
        visual: step1Done ? ("complete" as const) : ("pending" as const),
      },
      {
        id: "verify",
        title: "Verify your account",
        subtitle: step2Done
          ? "Verified"
          : verifyKind === "rejected"
            ? "Rejected"
            : verifyKind === "review"
              ? "In review"
              : "Unverified",
        href: "/settings?tab=business",
        visual: step2Visual,
      },
      {
        id: "terminal",
        title: "Set up Terminal",
        subtitle: step3Done
          ? terminalSetup.settlementDestination === "easner_balance"
            ? `${terminalSetup.defaultBalanceCurrency ?? "USD"} balance settlement`
            : "External payout destination saved"
          : "Choose Easner balance or an external payout",
        href: "/terminal",
        visual: step3Done ? ("complete" as const) : ("pending" as const),
      },
      {
        id: "fund",
        title: "Fund your account",
        subtitle: !profile.tier1Complete
          ? "Available after verification"
          : step4Done
            ? "Balance received"
            : "Deposit USD, EUR or stablecoins",
        href: "/accounts",
        visual: !profile.tier1Complete ? ("pending" as const) : step4Done ? ("complete" as const) : ("pending" as const),
      },
    ],
    [
      profile.onboardingComplete,
      profile.tier1Complete,
      step1Done,
      step2Done,
      step3Done,
      step4Done,
      verifyKind,
      step2Visual,
      terminalSetup.settlementDestination,
      terminalSetup.defaultBalanceCurrency,
    ],
  )

  // Wait for this account's profile (and fund balances when verification unlocks funding).
  if (!userId || profile.isLoading || !profile.hasData) return null
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
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{completedCount}/4</span>
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
