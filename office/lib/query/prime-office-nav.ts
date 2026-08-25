"use client"

import type { QueryClient } from "@tanstack/react-query"
import { officeOverviewQueryOptions } from "@/hooks/queries/use-office-overview"
import { officeUsersQueryOptions } from "@/hooks/queries/use-office-users"
import { officeTransactionsInfiniteOptions } from "@/hooks/queries/use-office-transactions"
import {
  officeBusinessesQueryOptions,
  officeCustomersQueryOptions,
  officeInvoicesQueryOptions,
  officeTerminalSessionsQueryOptions,
} from "@/hooks/queries/use-office-merchant-lists"
import { officeCurrenciesQueryOptions } from "@/hooks/queries/use-office-currencies"
import { officeNoahRatesQueryOptions } from "@/hooks/queries/use-office-noah-rates"
import { officeYcRatesQueryOptions } from "@/hooks/queries/use-office-yc-rates"
import { officeGridRatesQueryOptions } from "@/hooks/queries/use-office-grid-rates"
import { officeCryptoRatesQueryOptions } from "@/hooks/queries/use-office-crypto-rates"
import { officePayoutCorridorsQueryOptions } from "@/hooks/queries/use-office-payout-corridors"
import { officeCryptoDestinationsQueryOptions } from "@/hooks/queries/use-office-crypto-destinations"
import { officeProcessingFeeScheduleQueryOptions } from "@/hooks/queries/use-office-processing-fee-schedule"
import { officeSystemSettingsQueryOptions } from "@/hooks/queries/use-office-system-settings"

/**
 * Boot-time data primer for the admin shell (docs/speed-ux-plan.md).
 *
 * Every prefetch reuses the exact queryKey + queryFn + staleTime the page
 * hooks consume, so a warm cache makes each call a no-op and a page visit
 * after priming renders instantly from cache — matching the business app's
 * `primeWorkspaceNav` pattern.
 *
 * Wave 1 fetches the surfaces admins land on first (overview, users
 * directory, transactions). Wave 2 defers the long tail (reference catalogs,
 * rate tables, merchant lists) to idle time, in chunks, so the warm-up burst
 * never lands exactly when the user starts clicking.
 */

/** All fee-schedule scopes the platform-control page renders. */
const FEE_SCHEDULE_SCOPES = ["fiat_bank", "fiat_mobile_money", "crypto", "express_deposits"] as const

let warmInflight: Promise<void> | null = null

function waitForIdle(timeout: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const w = typeof window === "undefined" ? null : (window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
    })
    if (w && typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(() => resolve(), { timeout })
    } else {
      setTimeout(resolve, 250)
    }
  })
}

export function primeOfficeNav(queryClient: QueryClient): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (warmInflight) return warmInflight

  warmInflight = (async () => {
    // Wave 1 — first-landing surfaces, immediately.
    await Promise.allSettled([
      queryClient.prefetchQuery(officeOverviewQueryOptions("7d")),
      queryClient.prefetchQuery(officeUsersQueryOptions()),
      queryClient.prefetchInfiniteQuery(officeTransactionsInfiniteOptions({})),
    ])

    // Wave 2 — everything else, chunked across idle callbacks.
    await waitForIdle(2_000)
    await Promise.allSettled([
      queryClient.prefetchQuery(officeNoahRatesQueryOptions()),
      queryClient.prefetchQuery(officeYcRatesQueryOptions()),
      queryClient.prefetchQuery(officeGridRatesQueryOptions()),
      queryClient.prefetchQuery(officeCryptoRatesQueryOptions()),
      queryClient.prefetchQuery(officeCurrenciesQueryOptions("fiat")),
      queryClient.prefetchQuery(officeCurrenciesQueryOptions("rates")),
    ])

    await waitForIdle(2_000)
    await Promise.allSettled([
      queryClient.prefetchQuery(officePayoutCorridorsQueryOptions()),
      queryClient.prefetchQuery(officeCryptoDestinationsQueryOptions()),
      ...FEE_SCHEDULE_SCOPES.map((scope) =>
        queryClient.prefetchQuery(officeProcessingFeeScheduleQueryOptions(scope)),
      ),
      queryClient.prefetchQuery(officeSystemSettingsQueryOptions()),
    ])

    await waitForIdle(2_000)
    await Promise.allSettled([
      queryClient.prefetchQuery(officeBusinessesQueryOptions()),
      queryClient.prefetchQuery(officeCustomersQueryOptions()),
      queryClient.prefetchQuery(officeInvoicesQueryOptions()),
      queryClient.prefetchQuery(officeTerminalSessionsQueryOptions()),
    ])
  })()
    .catch(() => {
      // Best-effort warm; pages still fetch on visit.
    })
    .finally(() => {
      window.setTimeout(() => {
        warmInflight = null
      }, 4_000)
    })

  return warmInflight
}
