"use client"

import type React from "react"
import { useLayoutEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { WorkspaceBootSplash } from "@/components/loading-spinner"
import { useAuth } from "@/lib/auth-context"
import { redirectToWorkspaceLogin } from "@/lib/auth/workspace-login-redirect"
import { probeStoredSupabaseSession } from "@/lib/query/web-persist"
import { PlatformAccessGate } from "@/components/platform-access-gate"
import { useApplyStoredAppSurface } from "@/lib/use-app-surface"

const DASHBOARD_SHELL_ROOTS = [
  "/accounts",
  "/cards",
  "/customers",
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

export function AppSurfaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, isLoading, canBootstrapWorkspace } = useAuth()
  const applyStoredSurface = useApplyStoredAppSurface()
  const [clientReady, setClientReady] = useState(false)
  const [storedSessionLikelyValid, setStoredSessionLikelyValid] = useState(false)

  const isShellRoute = Boolean(pathname && isDashboardShellPath(pathname))

  useLayoutEffect(() => {
    // Cookie → surface in this same turn as `clientReady` so the first painted
    // nav is already Banking or Dev. Do not read cookies in the root layout.
    applyStoredSurface?.()
    // Probe once: it JSON-parses the full Supabase session blob and walks it
    // recursively — doing that in the render body ran on every navigation and
    // every auth-context tick. Auth state changes flow through `useAuth()`.
    setStoredSessionLikelyValid(probeStoredSupabaseSession().likelyAuthenticated)
    setClientReady(true)
  }, [applyStoredSurface])

  // First paint must match SSR (empty shell). Reading localStorage before
  // `clientReady` is the React #418 hydration mismatch on /dashboard.
  const canShowWorkspace =
    Boolean(user) ||
    (clientReady && isLoading && (canBootstrapWorkspace || storedSessionLikelyValid))

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
    return <PlatformAccessGate>{children}</PlatformAccessGate>
  }

  if (!canShowWorkspace) {
    if (definitivelyLoggedOut) {
      return <WorkspaceBootSplash />
    }
    return null
  }

  return (
    <PlatformAccessGate>
      <DashboardShell>
        {children}
      </DashboardShell>
    </PlatformAccessGate>
  )
}
