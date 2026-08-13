"use client"

import type React from "react"
import { useLayoutEffect } from "react"
import { usePathname } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { WorkspaceBootSplash } from "@/components/loading-spinner"
import { useAuth } from "@/lib/auth-context"
import { redirectToWorkspaceLogin } from "@/lib/auth/workspace-login-redirect"

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
 * so page chrome (header, verification banner, scroll) stays consistent. Top spacing
 * below the header lives on DashboardShell `<main>` (pt-6); avoid duplicate pt-* on page roots.
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
  const { user, isLoading, canBootstrapWorkspace } = useAuth()

  if (!pathname || !isDashboardShellPath(pathname)) {
    return <>{children}</>
  }

  const canShowWorkspace = Boolean(user) || (isLoading && canBootstrapWorkspace)

  useLayoutEffect(() => {
    if (canShowWorkspace) return
    redirectToWorkspaceLogin()
  }, [canShowWorkspace])

  if (!canShowWorkspace) {
    return <WorkspaceBootSplash />
  }

  const { constrained } = resolveShellProps(pathname)
  return (
    <DashboardShell constrained={constrained}>
      {children}
    </DashboardShell>
  )
}
