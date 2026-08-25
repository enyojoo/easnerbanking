"use client"

import {
  CreditCard,
  LayoutDashboard,
  List,
  Wallet,
  ReceiptText,
  ChevronDown,
  ChevronRight,
  Send,
  Inbox,
  Building2,
  SmartphoneNfc,
  Users,
  Link2,
  Code,
  CircleDollarSign,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { BusinessLogo } from "@/components/brand/business-logo"
import { useAuth } from "@/lib/auth-context"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { Tier1VerificationBadge } from "@/components/compliance/tier1-verification-badge"
import { BusinessOnboardingChecklist } from "@/components/business-onboarding-checklist"
import { StableImage } from "@easner/shared"
import { normalizeBusinessLogoUrl, warmBusinessLogoUrl } from "@/lib/image-cache"
import { isNavPathActive } from "@/lib/navigation/is-nav-path-active"
import { useScope } from "@/lib/query/scope"
import { prefetchRouteWorkspaceData } from "@/lib/query/workspace-prefetch"
import { useState, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"

function deriveOpenGroups(pathname: string) {
  const openGroups = new Set<string>()
  if (
    pathname.startsWith("/send") ||
    pathname.startsWith("/cards") ||
    pathname.startsWith("/payroll")
  ) {
    openGroups.add("spending")
  }
  if (
    pathname.startsWith("/invoices") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/links") ||
    pathname.startsWith("/terminal")
  ) {
    openGroups.add("collections")
  }
  return openGroups
}

export function DashboardNav() {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const { user } = useAuth()
  const {
    name: businessName,
    logoUrl: businessLogoUrl,
    isLoading: businessProfileLoading,
    hasData: businessProfileHasData,
    tier1Complete,
    tier1VerificationStatus,
  } = useBusinessProfile()

  const showBusinessHeaderSkeleton = businessProfileLoading && !businessProfileHasData

  const hasBusinessLogo = Boolean(businessLogoUrl?.trim())
  const normalizedBusinessLogoUrl = normalizeBusinessLogoUrl(businessLogoUrl)

  useEffect(() => {
    warmBusinessLogoUrl(normalizedBusinessLogoUrl)
  }, [normalizedBusinessLogoUrl])

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => deriveOpenGroups(pathname))

  useEffect(() => {
    setOpenGroups(deriveOpenGroups(pathname))
  }, [pathname])

  const toggleGroup = (groupKey: string) => {
    setOpenGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey)
      } else {
        newSet.add(groupKey)
      }
      return newSet
    })
  }

  const menuItems = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard, type: "single" as const },
    {
      key: "spending",
      label: "Spending",
      icon: CircleDollarSign,
      type: "group" as const,
      items: [
        { href: "/send", label: "Send", icon: Send },
        { href: "/cards", label: "Cards", icon: CreditCard },
        { href: "/payroll", label: "Payroll", icon: Users },
      ],
    },
    {
      key: "collections",
      label: "Collections",
      icon: Inbox,
      type: "group" as const,
      items: [
        { href: "/payments", label: "Payments", icon: Inbox },
        { href: "/invoices", label: "Invoices", icon: ReceiptText },
        { href: "/products", label: "Products", icon: Package },
        { href: "/checkout", label: "Checkout", icon: Code },
        { href: "/links", label: "Links", icon: Link2 },
        { href: "/terminal", label: "Terminal", icon: SmartphoneNfc },
      ],
    },
    { href: "/transactions", label: "Transactions", icon: List, type: "single" as const },
    { href: "/accounts", label: "Accounts", icon: Wallet, type: "single" as const },
  ]

  const navItemBase =
    "w-full justify-start gap-3 px-3 py-2.5 min-h-11 h-auto text-sm font-medium rounded-xl transition-[background-color,color,box-shadow,border-color] duration-200 stroke-[1.5]"
  const navItemInactive =
    "text-muted-foreground hover:bg-muted/70 hover:text-foreground border border-transparent"
  const navItemActive =
    "bg-card text-foreground font-semibold shadow-card border border-border/70 [&_svg]:text-primary"
  const iconBase = "h-[18px] w-[18px] flex-shrink-0 stroke-[1.5]"

  const prefetchHref = (href: string) => {
    try {
      router.prefetch(href)
    } catch {
      // Best-effort only.
    }
    if (scope) {
      void prefetchRouteWorkspaceData(queryClient, scope, href)
    }
  }

  // Sweeping the pointer down the sidebar must not fire a prefetch per item —
  // wait ~100ms of dwell, and cancel on leave (same pattern as
  // lib/query/use-hover-prefetch.ts).
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelScheduledPrefetch = () => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current)
      prefetchTimerRef.current = null
    }
  }
  const schedulePrefetch = (href: string) => {
    cancelScheduledPrefetch()
    prefetchTimerRef.current = setTimeout(() => {
      prefetchTimerRef.current = null
      prefetchHref(href)
    }, 100)
  }

  return (
    <div className="fixed left-0 top-0 h-screen w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="flex h-16 min-h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card shadow-soft border border-border/60">
          {hasBusinessLogo && normalizedBusinessLogoUrl ? (
            <StableImage
              src={normalizedBusinessLogoUrl}
              alt=""
              retainPrevious
              className="h-full w-full object-cover"
            />
          ) : (
            <Building2 className="h-[18px] w-[18px] text-primary stroke-[1.5]" />
          )}
        </div>
        {showBusinessHeaderSkeleton ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 w-14 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <span className="w-full truncate text-sm font-semibold leading-tight tracking-tight">{businessName}</span>
            <Tier1VerificationBadge
              tier1Complete={tier1Complete}
              tier1VerificationStatus={tier1VerificationStatus}
              compact
            />
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-5 overflow-y-auto">
        {menuItems.map((item) => {
          if (item.type === "single") {
            const Icon = item.icon
            const isActive = isNavPathActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href || "#"}
                onMouseEnter={() => schedulePrefetch(item.href)}
                onMouseLeave={cancelScheduledPrefetch}
                onFocus={() => schedulePrefetch(item.href)}
                aria-current={isActive ? "page" : undefined}
              >
                <div
                  className={cn(
                    "flex items-center",
                    navItemBase,
                    isActive ? navItemActive : navItemInactive,
                  )}
                >
                  <Icon className={iconBase} />
                  <span className="truncate">{item.label}</span>
                </div>
              </Link>
            )
          } else {
            const isOpen = openGroups.has(item.key || "")
            const hasActiveChild = item.items?.some((child) => isNavPathActive(pathname, child.href)) || false

            return (
              <div key={item.key} className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  onClick={() => toggleGroup(item.key || "")}
                  className={cn(
                    "w-full justify-between gap-3 px-3 py-2.5 min-h-11 h-auto text-sm font-medium rounded-xl transition-all duration-200",
                    hasActiveChild ? navItemActive : navItemInactive,
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={iconBase} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 stroke-[1.5]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 stroke-[1.5]" />
                  )}
                </Button>

                {isOpen && (
                  <div className="ml-5 flex flex-col gap-0.5 border-l border-sidebar-border pl-2">
                    {item.items?.map((child) => {
                      const ChildIcon = child.icon
                      const isActive = isNavPathActive(pathname, child.href)
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onMouseEnter={() => schedulePrefetch(child.href)}
                          onMouseLeave={cancelScheduledPrefetch}
                          onFocus={() => schedulePrefetch(child.href)}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <div
                            className={cn(
                              navItemBase,
                              "flex items-center",
                              isActive ? navItemActive : navItemInactive,
                            )}
                          >
                            <ChildIcon className={iconBase} />
                            <span className="truncate">{child.label}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }
        })}
      </nav>

      {user?.id ? <BusinessOnboardingChecklist key={user.id} /> : null}

      <div className="px-5 py-4 border-t border-sidebar-border flex items-center justify-center">
        <BusinessLogo size="md" href="/" priority />
      </div>
    </div>
  )
}
