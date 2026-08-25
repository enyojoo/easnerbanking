"use client"

import type { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types"
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"

/**
 * FULL prefetch for dynamic (param) routes.
 *
 * Plain `router.prefetch(href)` uses kind "auto", which for a DYNAMIC route
 * prefetches only down to the nearest loading boundary — and we have none by
 * design — so it cached nothing and the click still paid a full server RSC
 * round trip (~1s+). Kind "full" caches the complete payload;
 * `experimental.staleTimes.dynamic` (30s) keeps it alive long enough for the
 * hover→click gesture, making detail opens instant.
 */
export function prefetchDynamicRouteFull(router: AppRouterInstance, href: string): void {
  try {
    router.prefetch(href, { kind: "full" as PrefetchKind })
  } catch {
    try {
      router.prefetch(href)
    } catch {
      // Best-effort only.
    }
  }
}
