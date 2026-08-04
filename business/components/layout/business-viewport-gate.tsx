"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { DesktopMinViewportGate } from "@/components/layout/desktop-min-viewport-gate"

function bypassesDesktopViewportGate(pathname: string) {
  if (pathname === "/invoice" || pathname.startsWith("/invoice/")) {
    return true
  }
  if (pathname === "/pay" || pathname.startsWith("/pay/")) {
    return true
  }
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return true
  }
  return false
}

export function BusinessViewportGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ""
  if (bypassesDesktopViewportGate(pathname)) {
    return <>{children}</>
  }
  return <DesktopMinViewportGate product="business">{children}</DesktopMinViewportGate>
}
