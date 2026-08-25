"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

interface UseRouteProtectionOptions {
  requireAuth?: boolean
  adminOnly?: boolean
  redirectTo?: string
}

export function useRouteProtection(options: UseRouteProtectionOptions = {}) {
  const { user, loading, isAdmin, sessionResolved } = useAuth()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)

  const {
    requireAuth = true,
    adminOnly = true,
    redirectTo = "/auth/login",
  } = options

  useEffect(() => {
    if (!requireAuth) {
      setIsChecking(false)
      return
    }

    // During the cached-admin fast boot `loading` is already false while the
    // stored session is still hydrating (`user` null). Redirecting on that
    // window sent every reload through /auth/login before bouncing back —
    // only a RESOLVED null session means signed out.
    if (loading || !sessionResolved) return

    if (!user) {
      router.push(redirectTo)
      setIsChecking(false)
      return
    }

    if (adminOnly && !isAdmin) {
      router.push(redirectTo)
      setIsChecking(false)
      return
    }

    setIsChecking(false)
  }, [user, loading, isAdmin, sessionResolved, router, requireAuth, adminOnly, redirectTo])

  return {
    isChecking: loading || isChecking,
    isAdmin,
  }
}
