"use client"

import type React from "react"
import { useLayoutEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { WorkspaceBootSplash } from "@/components/loading-spinner"
import { useAuth } from "@/lib/auth-context"
import { redirectToWorkspaceLogin } from "@/lib/auth/workspace-login-redirect"
import { probeStoredSupabaseSession } from "@/lib/query/web-persist"

const DASHBOARD_SHELL_ROOTS = [
  "/accounts",
  "/cards",
  "/dashboard",
  "/developers",
  "/invoices",
  "/payroll",
  "/checkout",
  "/links",
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
  const [clientReady, setClientReady] = useState(false)

  const isShellRoute = Boolean(pathname && isDashboardShellPath(pathname))

  useLayoutEffect(() => {
    setClientReady(true)
  }, [])

  const storedSessionLikelyValid = clientReady
    ? probeStoredSupabaseSession().likelyAuthenticated
    : canBootstrapWorkspace

  const canShowWorkspace =
    Boolean(user) ||
    ((isLoading || !clientReady) && (canBootstrapWorkspace || storedSessionLikelyValid))

  const definitivelyLoggedOut =
    clientReady &&
    !isLoading &&
    !user &&
    !canBootstrapWorkspace &&
    !storedSessionLikelyValid

  useLayoutEffect(() => {
    if (!isShellRoute) return
    if (canShowWorkspace || isLoading) return
    redirectToWorkspaceLogin()
  }, [isShellRoute, canShowWorkspace, isLoading])

  if (!isShellRoute) {
    return <>{children}</>
  }

  if (!canShowWorkspace) {
    if (definitivelyLoggedOut) {
      return <WorkspaceBootSplash />
    }
    return null
  }

  const { constrained } = resolveShellProps(pathname!)
  return (
    <DashboardShell constrained={constrained}>
      {children}
    </DashboardShell>
  )
}
