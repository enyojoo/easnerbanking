"use client"

import type React from "react"
import { useAuth } from "@/lib/auth-context"
import { usePathname, useRouter, useSelectedLayoutSegments } from "next/navigation"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  parseTransactionDetailPathname,
  TransactionDetailView,
} from "@/components/transactions/transaction-detail-view"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { MessageCircle } from "lucide-react"
import { DashboardNav } from "@/components/dashboard-nav"
import { BusinessDropdown } from "@/components/business-dropdown"
import { AppLockProvider } from "@/components/app-lock/app-lock-provider"
import { Button } from "@/components/ui/button"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useBusinessSync } from "@/hooks/use-business-sync"
import { usePersonalProfileAvatar } from "@/lib/use-personal-profile-avatar"
import { openBusinessSupport } from "@/lib/intercom-messenger"
import {
  verificationBannerCopy,
  verificationBannerCta,
  verificationBannerHasCta,
  verificationBannerStarted,
} from "@/lib/copy/business-ui-copy"
import { useScope } from "@/lib/query/scope"
import { primeWorkspaceNav, WORKSPACE_WARM_EVENT } from "@/lib/query/prime-workspace-nav"
import {
  HOSTED_KYB_PRIME_EVENT,
  primeBusinessVerificationFlow,
} from "@/lib/compliance/prime-business-verification-flow"
import { isSettingsVerificationFlowLocation } from "@/lib/compliance/cutover-comms"
import { AccountRestrictionBanner } from "@/components/account-restriction-banner"
import { useAccountRestriction } from "@/hooks/use-account-restriction"

function useHostedVerificationFlowOpen() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const read = () => {
      const urlOpen = isSettingsVerificationFlowLocation(
        window.location.pathname,
        window.location.search,
      )
      const dataOpen = document.documentElement.dataset.verificationFlowOpen === "true"
      setOpen(urlOpen || dataOpen)
    }
    read()
    window.addEventListener("popstate", read)
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-verification-flow-open"],
    })
    return () => {
      window.removeEventListener("popstate", read)
      observer.disconnect()
    }
  }, [])

  return open
}

interface DashboardShellProps {
  children: React.ReactNode
}

export function DashboardShell({ children }: DashboardShellProps) {
  useBusinessSync()
  const { user, logout, sessionUserId } = useAuth()
  const router = useRouter()
  const pathname = usePathname() ?? ""
  const onSettingsPage = pathname === "/settings" || pathname.startsWith("/settings/")
  const queryClient = useQueryClient()

  /**
   * Client-detail overlay: transaction rows navigate with shallow
   * `history.pushState` (see TransactionDetailPrefetchLink), which updates
   * `usePathname()` WITHOUT a server round trip and without changing the
   * rendered route below. When the pathname says "transaction detail" but
   * the router segments say we're still on another page, the shell renders
   * the detail view itself and hides (not unmounts) the underlying page —
   * so opening is a same-frame swap and going back restores the list with
   * its scroll and state intact. Real navigations to /transactions/[etid]
   * (deep links, refresh) render the actual route; the overlay stays off.
   */
  const segments = useSelectedLayoutSegments()
  const detailFromPathname = parseTransactionDetailPathname(pathname)
  const routeIsRealDetail = segments[0] === "transactions" && segments.length > 1
  const clientDetailId = routeIsRealDetail ? null : detailFromPathname
  const mainRef = useRef<HTMLElement | null>(null)
  const savedScrollTopRef = useRef(0)

  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main) return
    if (clientDetailId) {
      savedScrollTopRef.current = main.scrollTop
      main.scrollTop = 0
    } else {
      main.scrollTop = savedScrollTopRef.current
    }
  }, [clientDetailId])
  const { scope } = useScope()
  const {
    name: businessName,
    ownerName,
    isLoading: profileLoading,
    hasData: profileHasData,
    tier1Complete,
    tier1VerificationStatus,
    tier1CanResubmit,
    businessId,
    noahKybCustomerId,
    canManageBusinessVerification,
  } = useBusinessProfile()
  const { avatarUrl: profileImageUrl } = usePersonalProfileAvatar()
  /** Keep header avatar visible when personal settings are hydrated even if business profile is still loading. */
  const showProfileChromeSkeleton = profileLoading && !profileHasData && !profileImageUrl
  const hostedVerificationFlowOpen = useHostedVerificationFlowOpen()
  const restrictionQuery = useAccountRestriction()
  const showTier1Banner =
    profileHasData &&
    !profileLoading &&
    !tier1Complete &&
    !hostedVerificationFlowOpen &&
    !onSettingsPage &&
    !restrictionQuery.data?.active
  const showRestrictionBanner = Boolean(
    restrictionQuery.data?.active && restrictionQuery.data.phase === "wind_down",
  )

  useEffect(() => {
    const prime = () =>
      primeBusinessVerificationFlow({
        businessId,
        canManageBusinessVerification,
        tier1Complete,
        tier1CanResubmit,
      })
    prime()
    window.addEventListener(HOSTED_KYB_PRIME_EVENT, prime)
    return () => window.removeEventListener(HOSTED_KYB_PRIME_EVENT, prime)
  }, [businessId, canManageBusinessVerification, tier1Complete, tier1CanResubmit])

  useEffect(() => {
    if (!sessionUserId) return
    const warm = () =>
      void primeWorkspaceNav({
        queryClient,
        scope,
        router,
        businessId,
      })
    warm()
    window.addEventListener(WORKSPACE_WARM_EVENT, warm)
    return () => window.removeEventListener(WORKSPACE_WARM_EVENT, warm)
  }, [businessId, queryClient, router, scope, sessionUserId])

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
              {verificationBannerHasCta(tier1VerificationStatus) ? (
                <Link
                  href="/settings?tab=verification"
                  className="font-semibold text-[hsl(var(--warning))] underline underline-offset-2"
                >
                  {verificationBannerCta(tier1VerificationStatus, {
                    started: verificationBannerStarted(tier1VerificationStatus, noahKybCustomerId),
                    canManage: canManageBusinessVerification,
                  })}
                </Link>
              ) : null}
            </div>
          ) : null}
          {showRestrictionBanner && restrictionQuery.data ? (
            <AccountRestrictionBanner restriction={restrictionQuery.data} />
          ) : null}
          {/*
            Page chrome contract: header + optional banner sit above main (shrink-0).
            Inner column is h-dvh overflow-hidden so only main scrolls on long pages
            (payroll, invoices, etc.). Outer shell stays min-h-dvh without overflow
            clip so browser fullscreen / PWA resize is not blocked.
          */}
          <main
            ref={mainRef}
            style={
              {
                "--dashboard-sticky-top":
                  showTier1Banner || showRestrictionBanner ? "6.5rem" : "4rem",
              } as React.CSSProperties
            }
            className="mx-auto min-h-0 w-full max-w-[1440px] flex-1 overflow-y-auto overscroll-contain px-8 pb-10 pt-6"
          >
            {/*
              Hidden, not unmounted: the page keeps its state for instant back.
              Flex fill so full-page Settings flows (hosted KYB / Connect / Express)
              still inherit main's height chain for inner overflow-y-auto scrolling
              when html[data-verification-flow-open] makes main a flex column.
            */}
            <div className={clientDetailId ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
              {children}
            </div>
            {clientDetailId ? <TransactionDetailView rawId={clientDetailId} /> : null}
          </main>
        </div>
      </div>
    </AppLockProvider>
  )
}
