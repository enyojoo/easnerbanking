"use client"

import { usePathname } from "next/navigation"
import { useRouteProtection } from "@/hooks/use-route-protection"

const PROTECTED_PATHS = [
  "/dashboard",
  "/rates",
  "/kyc",
  "/compliance",
  "/users",
  "/settings",
  "/transactions",
  "/business",
  "/platform",
]

function isProtectedPath(pathname: string | null): boolean {
  if (!pathname) return false
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

export function ProtectedRouteWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  useRouteProtection({ requireAuth: true, adminOnly: true, redirectTo: "/auth/login" })

  if (!isProtectedPath(pathname)) {
    return <>{children}</>
  }

  return <>{children}</>
}
