"use client"

import type { ReactNode } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { DesktopMinViewportGate } from "@/components/layout/desktop-min-viewport-gate"
import { SETTINGS_VERIFICATION_FLOW_PARAM } from "@/lib/compliance/cutover-comms"

function bypassesDesktopViewportGate(pathname: string, flow: string | null) {
  if (pathname === "/invoice" || pathname.startsWith("/invoice/")) {
    return true
  }
  if (pathname === "/pay" || pathname.startsWith("/pay/")) {
    return true
  }
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return true
  }
  // Hosted KYB is a full-page flow — do not bounce the user to the wide-screen wall.
  if (
    (pathname === "/settings" || pathname.startsWith("/settings/")) &&
    flow === SETTINGS_VERIFICATION_FLOW_PARAM
  ) {
    return true
  }
  return false
}

export function BusinessViewportGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams()
  const flow = searchParams.get("flow")
  if (bypassesDesktopViewportGate(pathname, flow)) {
    return <>{children}</>
  }
  return <DesktopMinViewportGate product="business">{children}</DesktopMinViewportGate>
}
