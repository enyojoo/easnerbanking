"use client"

import type { QueryClient } from "@tanstack/react-query"
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"
import type { Scope } from "@easner/shared"
import { prefetchAllNavWorkspaceData } from "@/lib/query/workspace-prefetch"
import { primeConnectStatus } from "@/lib/stripe/connect-status-cache"

export const WORKSPACE_WARM_EVENT = "easner-prime-workspace-nav"

/** Sidebar destinations plus Settings (header). */
export const WORKSPACE_NAV_HREFS = [
  "/dashboard",
  "/send",
  "/payroll",
  "/cards",
  "/invoices",
  "/transactions",
  "/accounts",
  "/settings",
] as const

const SECONDARY_NAV_HREFS = ["/terminal", "/qr-pay"] as const

let warmInflight: Promise<void> | null = null

export function requestWorkspaceWarm() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(WORKSPACE_WARM_EVENT))
}

function prefetchHref(router: AppRouterInstance, href: string) {
  try {
    router.prefetch(href)
  } catch {
    // Best-effort only.
  }
}

export function primeWorkspaceNav(options: {
  queryClient: QueryClient
  scope: Scope | null | undefined
  router: AppRouterInstance
  businessId?: string | null
}): Promise<void> {
  if (warmInflight) return warmInflight

  const { queryClient, scope, router, businessId } = options

  warmInflight = (async () => {
    for (const href of WORKSPACE_NAV_HREFS) prefetchHref(router, href)

    const idle = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
    }
    const prefetchSecondary = () => {
      for (const href of SECONDARY_NAV_HREFS) prefetchHref(router, href)
    }
    if (typeof idle.requestIdleCallback === "function") {
      idle.requestIdleCallback(prefetchSecondary, { timeout: 2000 })
    } else {
      window.setTimeout(prefetchSecondary, 250)
    }

    primeConnectStatus(businessId)

    void import("@/lib/use-send-destinations").then((m) => m.prefetchSendDestinations())
    void import("@/lib/use-payout-corridors").then((m) => m.prefetchPayoutCorridors())
    void import("@/lib/address/register-lib-address-countries").then((m) =>
      m.ensureBusinessOperationalAddressCountriesRegistered(),
    )

    if (scope) {
      await prefetchAllNavWorkspaceData(queryClient, scope)
    }
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
