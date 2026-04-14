"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Check, ChevronDown, ChevronUp, CircleDashed, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { isBusinessInfoStepComplete } from "@/lib/business-tab-completion"
import { parseBalanceString } from "@/hooks/use-business-account-rows"
import {
  businessNoahAccountsPersistKey,
  CACHE_KEYS,
  dataCache,
  EASNER_TERMINAL_PAYOUT_SETUP_UPDATED_EVENT,
} from "@/lib/cache"
import {
  fetchTerminalPayoutSetup,
  type TerminalPayoutSetupData,
} from "@/hooks/use-terminal-payout-setup-cached"

const NOAH_BUSINESS_HEADERS = { "X-Easner-Noah-Scope": "business" } as const

type SnapshotBalances = { USD: string; EUR: string }

function isSnapshotBalances(v: unknown): v is SnapshotBalances {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return typeof o.USD === "string" && typeof o.EUR === "string"
}

function readSnapshotBalancesFromLocalStorage(userId: string): SnapshotBalances | null {
  try {
    const raw = localStorage.getItem(businessNoahAccountsPersistKey(userId))
    if (!raw) return null
    const wrap = JSON.parse(raw) as { data?: unknown }
    const d = wrap.data
    if (!d || typeof d !== "object") return null
    const b = (d as Record<string, unknown>).balances
    return isSnapshotBalances(b) ? b : null
  } catch {
    return null
  }
}

function balancesFromCache(userId: string): SnapshotBalances | null {
  const snap = dataCache.get<{ balances: SnapshotBalances }>(CACHE_KEYS.BUSINESS_NOAH_ACCOUNT_SNAPSHOT(userId))
  if (snap?.balances && isSnapshotBalances(snap.balances)) return snap.balances
  return readSnapshotBalancesFromLocalStorage(userId)
}

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

export function BusinessOnboardingChecklist() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const profile = useBusinessProfile()
  const [expanded, setExpanded] = useState(false)
  const [terminalPayoutId, setTerminalPayoutId] = useState<string | null | undefined>(undefined)
  const [funded, setFunded] = useState(false)

  const step1Done = isBusinessInfoStepComplete(profile)
  const step2Done = profile.tier1Complete
  const verifyKind = tier1VerificationKind(profile.tier1Complete, profile.tier1VerificationStatus)
  const step3Done = Boolean(terminalPayoutId)

  const refreshBalances = useCallback(async () => {
    if (!userId || !profile.tier1Complete) {
      setFunded(false)
      return
    }
    const cached = balancesFromCache(userId)
    if (hasPositiveFiat(cached)) {
      setFunded(true)
      return
    }
    try {
      const res = await fetchWithSession("/api/noah/wallets/balances", { headers: NOAH_BUSINESS_HEADERS })
      if (!res.ok) {
        setFunded(hasPositiveFiat(cached))
        return
      }
      const b = (await res.json()) as { USD?: string; EUR?: string }
      const next: SnapshotBalances = {
        USD: typeof b.USD === "string" ? b.USD : "0",
        EUR: typeof b.EUR === "string" ? b.EUR : "0",
      }
      setFunded(hasPositiveFiat(next))
    } catch {
      setFunded(hasPositiveFiat(cached))
    }
  }, [profile.tier1Complete, userId])

  const applyTerminalFromCache = useCallback(() => {
    if (!userId) return
    const d = dataCache.get<TerminalPayoutSetupData>(CACHE_KEYS.TERMINAL_PAYOUT_SETUP(userId))
    if (d != null) {
      setTerminalPayoutId(d.defaultTerminalPayoutId)
    }
  }, [userId])

  const refreshTerminal = useCallback(async () => {
    if (!userId) {
      setTerminalPayoutId(undefined)
      return
    }
    try {
      const data = await fetchTerminalPayoutSetup()
      setTerminalPayoutId(data.defaultTerminalPayoutId)
    } catch {
      setTerminalPayoutId(null)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setTerminalPayoutId(undefined)
      return
    }
    applyTerminalFromCache()
    void refreshTerminal()
  }, [applyTerminalFromCache, refreshTerminal, userId])

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
      applyTerminalFromCache()
      void refreshTerminal()
    }
    window.addEventListener("business-profile-updated", onProfile)
    return () => window.removeEventListener("business-profile-updated", onProfile)
  }, [applyTerminalFromCache, refreshTerminal])

  useEffect(() => {
    const onTerminalUpdated = () => {
      applyTerminalFromCache()
      void refreshTerminal()
    }
    window.addEventListener(EASNER_TERMINAL_PAYOUT_SETUP_UPDATED_EVENT, onTerminalUpdated)
    return () => window.removeEventListener(EASNER_TERMINAL_PAYOUT_SETUP_UPDATED_EVENT, onTerminalUpdated)
  }, [applyTerminalFromCache, refreshTerminal])

  useEffect(() => {
    if (expanded) {
      void refreshTerminal()
      void refreshBalances()
    }
  }, [expanded, refreshBalances, refreshTerminal])

  const step4Done = profile.tier1Complete && funded

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
        subtitle: step3Done ? "Payout destination saved" : "Choose a default terminal payout",
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
    [profile.onboardingComplete, profile.tier1Complete, step1Done, step2Done, step3Done, step4Done, verifyKind, step2Visual],
  )

  if (profile.isLoading || !profile.hasData) return null
  if (allDone) return null

  return (
    <div className="border-t border-sidebar-border px-3 pb-2 pt-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className={cn(
          "flex w-full min-w-0 items-center justify-between gap-1.5 rounded-full border border-primary/35 bg-sidebar px-2 py-1.5 text-left font-medium leading-snug text-foreground shadow-sm transition-colors",
          "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
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
                    "flex gap-2.5 rounded-md p-1 -m-1 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
