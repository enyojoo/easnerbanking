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

function matchesShellRoot(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`)
}

function isDashboardShellPath(pathname: string) {
  return DASHBOARD_SHELL_ROOTS.some((root) => matchesShellRoot(pathname, root))
}

function resolveShellProps(pathname: string) {
  const constrained = matchesShellRoot(pathname, "/dashboard")
  const mainClassName = ["/qr-pay", "/settings", "/terminal"].some((root) =>
    matchesShellRoot(pathname, root),
  )
    ? "overflow-y-auto"
    : ""

  return { constrained, mainClassName }
}

export function AppSurfaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (!pathname || !isDashboardShellPath(pathname)) {
    return <>{children}</>
  }

  const { constrained, mainClassName } = resolveShellProps(pathname)
  return (
    <DashboardShell constrained={constrained} mainClassName={mainClassName}>
      {children}
    </DashboardShell>
  )
}
