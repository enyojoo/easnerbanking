"use client"

import type React from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { MessageCircle } from "lucide-react"
import { DashboardNav } from "@/components/dashboard-nav"
import { BusinessDropdown } from "@/components/business-dropdown"
import { AppLockProvider } from "@/components/app-lock/app-lock-provider"
import { Button } from "@/components/ui/button"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useBusinessNoahSync } from "@/hooks/use-business-noah-sync"
import { usePersonalProfileAvatar } from "@/lib/use-personal-profile-avatar"
import { openBusinessSupport } from "@/lib/intercom-messenger"
import { verificationBannerCopy } from "@/lib/copy/business-ui-copy"
import { cn } from "@/lib/utils"
import { useScope } from "@/lib/query/scope"
import { prefetchWorkspaceCriticalData } from "@/lib/query/workspace-prefetch"

interface DashboardShellProps {
  children: React.ReactNode
  /** Use max-width constraint like dashboard (max-w-6xl) */
  constrained?: boolean
}

export function DashboardShell({ children, constrained = false }: DashboardShellProps) {
  useBusinessNoahSync()
  const { user, logout, sessionUserId } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const {
    name: businessName,
    ownerName,
    isLoading: profileLoading,
    hasData: profileHasData,
    tier1Complete,
    tier1VerificationStatus,
  } = useBusinessProfile()
  const { avatarUrl: profileImageUrl } = usePersonalProfileAvatar()
  /** Keep header avatar visible when personal settings are hydrated even if business profile is still loading. */
  const showProfileChromeSkeleton = profileLoading && !profileHasData && !profileImageUrl
  const showTier1Banner = profileHasData && !profileLoading && !tier1Complete

  useEffect(() => {
    if (!sessionUserId || !scope) return
    const criticalRoutes = [
      "/dashboard",
      "/send",
      "/transactions",
      "/accounts",
    ] as const

    const secondaryRoutes = [
      "/cards",
      "/invoices",
      "/payroll",
      "/terminal",
      "/qr-pay",
      "/settings",
    ] as const

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
      void prefetchWorkspaceCriticalData(queryClient, scope)
    }

    const w = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(prefetchSecondary, { timeout: 2000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(prefetchSecondary, 250)
    return () => window.clearTimeout(t)
  }, [queryClient, router, scope, sessionUserId])

  return (
    <AppLockProvider>
      <div className="min-h-dvh bg-background text-foreground">
        <DashboardNav />
        <div className="ml-64 flex h-dvh flex-col overflow-hidden">
          <header className="z-30 flex h-16 min-h-16 shrink-0 items-center justify-end gap-3 border-b border-border/60 bg-background/80 px-8 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
          {showProfileChromeSkeleton ? (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-full border-2 border-border bg-muted" />
              <div className="h-9 w-9 animate-pulse rounded-full border-2 border-border bg-muted" />
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-9 shrink-0 rounded-full border-2 border-border p-0 hover:bg-muted/50"
                aria-label="Support chat"
                onClick={() => {
                  void openBusinessSupport()
                }}
              >
                <MessageCircle className="size-5 text-primary" strokeWidth={2} />
              </Button>
              <BusinessDropdown
                businessName={businessName}
                profileImageUrl={profileImageUrl}
                adminName={ownerName || "Admin"}
                adminEmail={user?.email || ""}
                onSignOut={logout}
                variant="header"
              />
            </>
          )}
          </header>
          {showTier1Banner ? (
            <div
              className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.12)] px-8 py-2.5 text-sm text-[hsl(var(--warning))] backdrop-blur-sm"
              role="status"
            >
              <span>{verificationBannerCopy(tier1VerificationStatus)}</span>
              <Link
                href="/settings?tab=verification"
                className="font-semibold text-[hsl(var(--warning))] underline underline-offset-2"
              >
                Verify
              </Link>
            </div>
          ) : null}
          {/*
            Page chrome contract: header + optional banner sit above main (shrink-0).
            Inner column is h-dvh overflow-hidden so only main scrolls on long pages
            (payroll, invoices, etc.). Outer shell stays min-h-dvh without overflow
            clip so browser fullscreen / PWA resize is not blocked.
          */}
          <main
            style={
              {
                "--dashboard-sticky-top": showTier1Banner ? "6.5rem" : "4rem",
              } as React.CSSProperties
            }
            className={cn(
              "flex-1 min-h-0 overflow-y-auto overscroll-contain px-8 pb-10 pt-6",
              constrained ? "mx-auto w-full max-w-6xl" : "mx-auto w-full max-w-[1440px]",
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </AppLockProvider>
  )
}
