"use client"

import type React from "react"
import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

export function PayAuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (isLoading) return
    if (user) return
    const qs = searchParams.toString()
    const path = qs ? `${pathname}?${qs}` : pathname
    router.replace(`/auth/login?next=${encodeURIComponent(path)}`)
  }, [user, isLoading, router, pathname, searchParams])

  if (isLoading || !user) {
    return (
      <div className="min-h-[40vh] bg-background" aria-busy="true" aria-label="Loading" />
    )
  }

  return <>{children}</>
}
