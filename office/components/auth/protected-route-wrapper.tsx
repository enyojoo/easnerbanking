"use client"

import { useRouteProtection } from "@/hooks/use-route-protection"

/**
 * Root auth guard: redirects unauthenticated / non-admin visitors to the
 * login page (the redirect lives in useRouteProtection). It renders children
 * directly — the previous per-path branching was dead code (both branches
 * returned children) and its usePathname() call re-rendered the app root on
 * every navigation for nothing.
 */
export function ProtectedRouteWrapper({ children }: { children: React.ReactNode }) {
  useRouteProtection({ requireAuth: true, adminOnly: true, redirectTo: "/auth/login" })
  return <>{children}</>
}
