"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { isPublicSurfacePath } from "@/lib/surface-paths"
import { Providers } from "@/components/providers"
import { PublicSurfaceProviders } from "@/components/public-surface-providers"

/**
 * Chooses a thin provider tree on public surfaces (auth, invoice, pay) vs the full
 * workspace tree (persisted RQ, Intercom, scope, image warm).
 */
export function SurfaceProviders({
  children,
  hostname,
}: {
  children: React.ReactNode
  hostname?: string | null
}) {
  const pathname = usePathname()
  const host =
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : null)
  const isPublic = isPublicSurfacePath(pathname, host)

  if (isPublic) {
    return <PublicSurfaceProviders>{children}</PublicSurfaceProviders>
  }

  return <Providers>{children}</Providers>
}
