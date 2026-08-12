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
export function SurfaceProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = isPublicSurfacePath(pathname)

  if (isPublic) {
    return <PublicSurfaceProviders>{children}</PublicSurfaceProviders>
  }

  return <Providers>{children}</Providers>
}
