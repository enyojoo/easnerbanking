"use client"

import type React from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import Link from "next/link"
import { DashboardNav } from "@/components/dashboard-nav"
import { BusinessDropdown } from "@/components/business-dropdown"
import { AppLockProvider } from "@/components/app-lock/app-lock-provider"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useBusinessNoahSync } from "@/hooks/use-business-noah-sync"
import { usePersonalProfileAvatar } from "@/lib/use-personal-profile-avatar"
import { cn } from "@/lib/utils"

interface DashboardShellProps {
  children: React.ReactNode
  /** Extra class for main content (e.g. overflow-y-auto) */
  mainClassName?: string
  /** Use max-width constraint like dashboard (max-w-6xl) */
  constrained?: boolean
}

export function DashboardShell({ children, mainClassName = "", constrained = false }: DashboardShellProps) {
  useBusinessNoahSync()
  const { user, isLoading, logout } = useAuth()
  const router = useRouter()
  const {
    name: businessName,
    ownerName,
    isLoading: profileLoading,
    hasData: profileHasData,
    tier1Complete,
  } = useBusinessProfile()
  const { avatarUrl: profileImageUrl } = usePersonalProfileAvatar()
  /** Keep header avatar/menu mounted while revalidating if we already showed org + profile once */
  const showProfileChromeSkeleton = profileLoading && !profileHasData
  const showTier1Banner = profileHasData && !profileLoading && !tier1Complete

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/auth/login")
    }
  }, [user, isLoading, router])

  useEffect(() => {
    if (isLoading || !user?.id) return
    const criticalRoutes = [
      "/dashboard",
      "/send",
      "/transactions",
      "/accounts",
    ] as const

    const secondaryRoutes = [
      "/cards",
      "/invoices",
      "/terminal",
      "/qr-pay",
      "/settings",
    ] as const

    // Prefetch critical routes immediately (first click feels instant).
    for (const href of criticalRoutes) {
      try {
        router.prefetch(href)
      } catch {
        // Best-effort only; never block render.
      }
    }

    const prefetchSecondary = () => {
      for (const href of secondaryRoutes) {
        try {
          router.prefetch(href)
        } catch {
          // Best-effort only; never block render.
        }
      }
    }

    // Prefetch after first paint so it doesn't compete with hydration.
    // Use idle time when available; fallback to a small delay.
    const w = window as any
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(prefetchSecondary, { timeout: 2000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(prefetchSecondary, 250)
    return () => window.clearTimeout(t)
  }, [isLoading, router, user?.id])

  if (isLoading || !user) {
    return null
  }

  return (
    <AppLockProvider>
      <div className="min-h-screen bg-background text-foreground">
        <DashboardNav />
        <div className="ml-64 flex min-h-screen flex-col">
          <header className="fixed top-0 left-64 right-0 z-30 flex h-16 min-h-16 items-center justify-end gap-4 border-b border-border/60 bg-background/80 px-8 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
          {showProfileChromeSkeleton ? (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <BusinessDropdown
              businessName={businessName}
              profileImageUrl={profileImageUrl}
              adminName={ownerName || "Admin"}
              adminEmail={user?.email || ""}
              onSignOut={logout}
              variant="header"
            />
          )}
          </header>
          {showTier1Banner ? (
          <div
            className="fixed top-16 left-64 right-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.12)] px-8 py-2.5 text-sm text-[hsl(var(--warning))] backdrop-blur-sm"
            role="status"
          >
            <span>
              Complete business verification to unlock payments and bank accounts for your organization.
            </span>
            <Link href="/settings?tab=business" className="font-semibold text-[hsl(var(--warning))] underline underline-offset-2">
              Verify
            </Link>
          </div>
          ) : null}
          <main
            style={
              {
                "--dashboard-sticky-top": showTier1Banner ? "6.5rem" : "4rem",
              } as React.CSSProperties
            }
            className={cn(
              "flex-1 px-8 pb-10",
              showTier1Banner ? "pt-[6.5rem]" : "pt-20",
              constrained ? "mx-auto w-full max-w-6xl" : "mx-auto w-full max-w-[1440px]",
              mainClassName,
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </AppLockProvider>
  )
}
