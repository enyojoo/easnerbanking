"use client"

import { useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"
import { fetchWithSession } from "@/lib/fetch-with-session"

export type TerminalPayoutRow = {
  id: string
  recipient_id: string
  /** Person / account title (first line in setup list). */
  account_name?: string
  /** e.g. `XOF · Mobile Money (MTN)` (second line). */
  detail_line?: string
  display_label: string
  currency: string
}

export type TerminalPayoutSetupData = {
  payouts: TerminalPayoutRow[]
  /** Resolved default id, or null if unset or not in the current payout list. */
  defaultTerminalPayoutId: string | null
}

export const TERMINAL_PAYOUT_SETUP_CACHE_TTL_MS = 60 * 60 * 1000

export async function fetchTerminalPayoutSetup(): Promise<TerminalPayoutSetupData> {
  const [payoutsRes, settingsRes] = await Promise.all([
    fetchWithSession("/api/terminal/payouts"),
    fetchWithSession("/api/terminal/settings"),
  ])

  const payoutsBody = (await payoutsRes.json().catch(() => ({}))) as {
    payouts?: TerminalPayoutRow[]
    error?: string
  }
  if (!payoutsRes.ok) {
    throw new Error(payoutsBody.error || "Failed to load payout methods")
  }

  const settingsBody = (await settingsRes.json().catch(() => ({}))) as {
    default_terminal_payout_id?: string | null
    error?: string
  }
  if (!settingsRes.ok) {
    throw new Error(settingsBody.error || "Failed to load terminal settings")
  }

  const payouts = payoutsBody.payouts ?? []
  const defRaw = settingsBody.default_terminal_payout_id ?? null
  const defaultTerminalPayoutId =
    defRaw && payouts.some((p) => p.id === defRaw) ? defRaw : null

  return { payouts, defaultTerminalPayoutId }
}

/**
 * Shared cache (memory + localStorage) for Setup payout: payout rows and default id.
 * Invalidate {@link CACHE_KEYS.TERMINAL_PAYOUT_SETUP} after mutating payouts or terminal settings from other code paths.
 */
export function useTerminalPayoutSetupCached() {
  const { user, isLoading } = useAuth()

  const fetcher = useCallback(() => fetchTerminalPayoutSetup(), [])

  return useCachedData<TerminalPayoutSetupData>({
    enabled: Boolean(user?.id) && !isLoading,
    cacheKey: user?.id ? CACHE_KEYS.TERMINAL_PAYOUT_SETUP(user.id) : null,
    persistKey: user?.id ? `terminal_payout_setup_${user.id}` : undefined,
    initialData: { payouts: [], defaultTerminalPayoutId: null },
    ttlMs: TERMINAL_PAYOUT_SETUP_CACHE_TTL_MS,
    fetcher,
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Terminal payout setup load failed:", message)
    },
  })
}
