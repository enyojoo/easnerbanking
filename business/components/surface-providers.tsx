"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { isPublicSurfacePath } from "@/lib/surface-paths"
import { useClientHostname } from "@/lib/use-client-hostname"
import { PublicSurfaceProviders } from "@/components/public-surface-providers"

/**
 * The full workspace provider tree (persisted React Query, Intercom, realtime,
 * scope, image warm) is a separate chunk: public surfaces (/auth, /invoice,
 * /pay-customer) never render it, so they never download it. Workspace pages
 * render it during SSR, so its chunk ships in their initial preload — no
 * extra round trip for the primary product.
 */
const Providers = dynamic(() => import("@/components/providers").then((m) => m.Providers))

/**
 * Chooses a thin provider tree on public surfaces (auth, invoice, pay) vs the full
 * workspace tree (persisted RQ, Intercom, scope, image warm).
 *
 * Hostname is resolved client-side (null during SSR/hydration) so the root
 * layout stays static; the pathname heuristics in `isPublicSurfacePath`
 * already recognize customer-host URL shapes for the first paint.
 */
export function SurfaceProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const host = useClientHostname()
  const isPublic = isPublicSurfacePath(pathname, host)

  if (isPublic) {
    return <PublicSurfaceProviders>{children}</PublicSurfaceProviders>
  }

  return <Providers>{children}</Providers>
}
