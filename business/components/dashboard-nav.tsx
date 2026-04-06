"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  CreditCard,
  LayoutDashboard,
  ArrowRightLeft,
  List,
  Wallet,
  UsersRound,
  ReceiptText,
  Contact,
  ChevronDown,
  ChevronRight,
  Send,
  Inbox,
  Building2,
  SmartphoneNfc,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BusinessLogo } from "@/components/brand/business-logo"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { Tier1VerificationBadge } from "@/components/compliance/tier1-verification-badge"

export function DashboardNav() {
  const pathname = usePathname()
  const {
    name: businessName,
    logoUrl: businessLogoUrl,
    isLoading: businessProfileLoading,
    tier1Complete,
    tier1VerificationStatus,
  } = useBusinessProfile()

  const hasBusinessLogo = Boolean(businessLogoUrl?.trim())

  const getInitialOpenGroups = () => {
    const openGroups = new Set<string>()
    if (pathname.startsWith("/send") || pathname.startsWith("/recipients")) {
      openGroups.add("payments")
    }
    if (
      pathname.startsWith("/invoices") ||
      pathname.startsWith("/customers") ||
      pathname.startsWith("/terminal")
    ) {
      openGroups.add("collections")
    }
    return openGroups
  }

  const [openGroups, setOpenGroups] = useState<Set<string>>(getInitialOpenGroups())

  useEffect(() => {
    setOpenGroups(getInitialOpenGroups())
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
      key: "payments",
      label: "Payments",
      icon: ArrowRightLeft,
      type: "group" as const,
      items: [
        { href: "/send", label: "Send", icon: Send },
        { href: "/recipients", label: "Recipients", icon: UsersRound },
      ],
    },
    { href: "/cards", label: "Cards", icon: CreditCard, type: "single" as const },
    {
      key: "collections",
      label: "Collections",
      icon: Inbox,
      type: "group" as const,
      items: [
        { href: "/invoices", label: "Invoices", icon: ReceiptText },
        { href: "/customers", label: "Customers", icon: Contact },
        { href: "/terminal", label: "Terminal", icon: SmartphoneNfc },
      ],
    },
    { href: "/transactions", label: "Transactions", icon: List, type: "single" as const },
    { href: "/accounts", label: "Accounts", icon: Wallet, type: "single" as const },
  ]

  return (
    <div className="fixed left-0 top-0 h-screen w-64 border-r bg-sidebar flex flex-col">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-3">
        <div
          key={hasBusinessLogo ? "nav-logo" : "nav-placeholder"}
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10"
        >
          {hasBusinessLogo ? (
            <img src={businessLogoUrl!} alt="" className="h-full w-full object-cover" />
          ) : (
            <Building2 className="h-6 w-6 text-primary" />
          )}
        </div>
        {businessProfileLoading ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-14 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="w-full truncate text-sm font-semibold leading-tight">{businessName}</span>
            <Tier1VerificationBadge
              tier1Complete={tier1Complete}
              tier1VerificationStatus={tier1VerificationStatus}
              compact
            />
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          if (item.type === "single") {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link key={item.href} href={item.href || "#"}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-3 px-3 py-3 h-auto text-sm font-medium rounded-md transition-all duration-200",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Button>
              </Link>
            )
          } else {
            const isOpen = openGroups.has(item.key || "")
            const hasActiveChild = item.items?.some((child) => pathname === child.href) || false

            return (
              <div key={item.key} className="space-y-1">
                <Button
                  variant="ghost"
                  onClick={() => toggleGroup(item.key || "")}
                  className={cn(
                    "w-full justify-between gap-3 px-3 py-3 h-auto text-sm font-medium rounded-md transition-all duration-200",
                    hasActiveChild
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0" />
                  )}
                </Button>

                {isOpen && (
                  <div className="ml-4 space-y-1">
                    {item.items?.map((child) => {
                      const ChildIcon = child.icon
                      const isActive = pathname === child.href
                      return (
                        <Link key={child.href} href={child.href}>
                          <Button
                            variant="ghost"
                            className={cn(
                              "w-full justify-start gap-3 px-3 py-3 h-auto text-sm font-medium rounded-md transition-all duration-200",
                              isActive
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                            )}
                          >
                            <ChildIcon className="h-5 w-5 flex-shrink-0" />
                            <span className="truncate">{child.label}</span>
                          </Button>
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

      <div className="px-4 py-4 border-t border-sidebar-border flex items-center justify-center">
        <BusinessLogo size="md" href="/" />
      </div>
    </div>
  )
}
