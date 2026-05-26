"use client"

import { useAuth } from "@/lib/auth-context"

/** Gate office admin queries until auth + admin_users check completes. */
export function useOfficeAdminEnabled() {
  const { user, isAdmin, loading: authLoading } = useAuth()
  return {
    enabled: !authLoading && Boolean(user && isAdmin),
    authLoading,
    user,
    isAdmin,
  }
}
