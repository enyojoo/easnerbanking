"use client"

import type { ReactNode } from "react"
import { Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { DesktopMinViewportGate } from "@/components/layout/desktop-min-viewport-gate"
import { parseSettingsVerificationFlow } from "@/lib/compliance/cutover-comms"
import { isPublicSurfacePath } from "@/lib/surface-paths"
import { useClientHostname } from "@/lib/use-client-hostname"

function bypassesDesktopViewportGate(pathname: string, flow: string | null, hostname?: string | null) {
  if (isPublicSurfacePath(pathname, hostname)) return true
  // Hosted KYB is a full-page flow – do not bounce the user to the wide-screen wall.
  if (
    (pathname === "/settings" || pathname.startsWith("/settings/")) &&
    parseSettingsVerificationFlow(flow) != null
  ) {
    return true
  }
  return false
}

function BusinessViewportGateInner({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams()
  const flow = searchParams.get("flow")
  const host = useClientHostname()
  if (bypassesDesktopViewportGate(pathname, flow, host)) {
    return <>{children}</>
  }
  return <DesktopMinViewportGate product="business">{children}</DesktopMinViewportGate>
}

export function BusinessViewportGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ""
  const host = useClientHostname()
  if (isPublicSurfacePath(pathname, host)) {
    return <>{children}</>
  }
  // Own Suspense so `useSearchParams` does not empty the root layout
  // (`<Suspense fallback={null}>` → React #418 on /dashboard).
  return (
    <Suspense fallback={<DesktopMinViewportGate product="business">{children}</DesktopMinViewportGate>}>
      <BusinessViewportGateInner>{children}</BusinessViewportGateInner>
    </Suspense>
  )
}
