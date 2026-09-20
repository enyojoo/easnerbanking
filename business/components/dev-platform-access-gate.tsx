"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { NeedDeveloperAccountPage } from "@/components/need-developer-account"
import { isProductHostSplit } from "@/lib/app-surface"
import { readDevPlatformFlag, resolveDevPlatformAccess } from "@/lib/dev-platform-access"
import { useAppSurface } from "@/lib/use-app-surface"
import { useBusinessProfile } from "@/lib/use-business-profile"

function ProductRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.assign(href)
  }, [href])
  return <NeedDeveloperAccountPage />
}

/**
 * Office-gated Platform access + wrong-surface redirects after hosts split.
 * Same-origin keeps pages on this host. Cookie platform + flag off is treated
 * as banking (cookie cleared in AppSurfaceProvider) — no origin bounce.
 */
export function DevPlatformAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  const surface = useAppSurface()
  const { devPlatformEnabled, hasData } = useBusinessProfile()
  const enabled = readDevPlatformFlag(hasData, devPlatformEnabled)
  const split = isProductHostSplit()
  const decision = resolveDevPlatformAccess({
    surface,
    pathname,
    hasData,
    enabled,
    split,
  })

  if (decision.action === "need-account") {
    return <NeedDeveloperAccountPage />
  }

  if (decision.action === "redirect") {
    return <ProductRedirect href={decision.href} />
  }

  return <>{children}</>
}
