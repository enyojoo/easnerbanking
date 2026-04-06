"use client"

import { AuthProvider } from "@/lib/auth-context"

interface ClientAuthProviderProps {
  children: React.ReactNode
}

/** Auth shell renders immediately; AuthProvider handles SSR-safe hydration (see `mounted` gate there). */
export function ClientAuthProvider({ children }: ClientAuthProviderProps) {
  return <AuthProvider>{children}</AuthProvider>
}
