"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"

const DASHBOARD_SHELL_ROOTS = [
  "/accounts",
  "/cards",
  "/dashboard",
  "/developers",
  "/invoices",
  "/payroll",
  "/qr-pay",
  "/send",
  "/settings",
  "/terminal",
  "/transactions",
] as const

/**
 * Every authenticated business workspace route must match one of DASHBOARD_SHELL_ROOTS
 * so page chrome (header, verification banner, scroll) stays consistent. Do not add
 * compensating pt-* on <main> or page roots — header/banner are in-flow above main.
 */

function matchesShellRoot(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`)
}

function isDashboardShellPath(pathname: string) {
  return DASHBOARD_SHELL_ROOTS.some((root) => matchesShellRoot(pathname, root))
}

function resolveShellProps(pathname: string) {
  const constrained = matchesShellRoot(pathname, "/dashboard")
  return { constrained }
}

export function AppSurfaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (!pathname || !isDashboardShellPath(pathname)) {
    return <>{children}</>
  }

  const { constrained } = resolveShellProps(pathname)
  return (
    <DashboardShell constrained={constrained}>
      {children}
    </DashboardShell>
  )
}
