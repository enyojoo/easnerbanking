"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { PrimeOfficeNavBridge } from "@/components/prime-office-nav-bridge"

/**
 * Mounts the admin shell ONCE, from the root layout, for every admin route.
 *
 * The shell used to be rendered inside each page, which inverted the App
 * Router model: every navigation unmounted and remounted the sidebar (losing
 * open-group state and scroll position), and the route `loading.tsx` mounted
 * it a second time per transition. With the shell here it persists across
 * navigations and only the content area swaps — matching the business app's
 * instant-navigation architecture (docs/speed-ux-plan.md, Phase O1).
 */
export function OfficeShellGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  const isPublic = pathname === "/" || pathname === "/auth" || pathname.startsWith("/auth/")

  if (isPublic) {
    return <>{children}</>
  }

  return (
    <OfficeDashboardLayout>
      <PrimeOfficeNavBridge />
      {children}
    </OfficeDashboardLayout>
  )
}
