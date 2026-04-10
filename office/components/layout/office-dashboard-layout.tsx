"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, LogOut, Menu, X } from "lucide-react"
import { BrandLogo } from "@easner/shared"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { officeDataStore } from "@/lib/office-data-store"
import {
  officeNavPrimaryLinks,
  officeNavCollapsibleSections,
  officeNavPlatformLink,
  isNavItemActive,
  isCollapsibleSectionActive,
} from "@/lib/nav-config"
import { cn } from "@/lib/utils"

interface OfficeDashboardLayoutProps {
  children: React.ReactNode
}

const singleButtonClass = (active: boolean) =>
  cn(
    "w-full justify-start gap-3 px-3 py-3 h-auto text-sm font-medium rounded-md transition-all duration-200",
    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  )

const groupHeaderButtonClass = (hasActiveChild: boolean) =>
  cn(
    "w-full justify-between gap-3 px-3 py-3 h-auto text-sm font-medium rounded-md transition-all duration-200",
    hasActiveChild ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  )

function getInitialOpenGroups(pathname: string | null): Set<string> {
  const next = new Set<string>()
  if (!pathname) return next
  if (
    pathname.startsWith("/businesses") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/invoices") ||
    pathname.startsWith("/terminal")
  ) {
    next.add("business")
  }
  if (pathname.startsWith("/monetization") || pathname.startsWith("/pricing-fx")) next.add("revenue")
  return next
}

export function OfficeDashboardLayout({ children }: OfficeDashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { signOut } = useAuth()

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => getInitialOpenGroups(pathname))

  useEffect(() => {
    setOpenGroups(getInitialOpenGroups(pathname))
  }, [pathname])

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleLogout = async () => {
    try {
      officeDataStore.clearDataCache()
      officeDataStore.destroy()
      await signOut()
      router.push("/auth/login")
    } catch (error) {
      console.error("Logout error:", error)
      router.push("/auth/login")
    }
  }

  const PlatformNavIcon = officeNavPlatformLink.icon

  return (
    <div className="flex h-screen bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-64 border-r bg-sidebar flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-6">
          <div className="flex min-w-0 items-center gap-2">
            <BrandLogo size="sm" href="/dashboard" className="shrink-0" />
            <span className="truncate text-sm font-medium text-primary">Office</span>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-6">
          {officeNavPrimaryLinks.map((item) => {
            const Icon = item.icon
            const active = isNavItemActive(pathname, item.href)
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}>
                <Button variant="ghost" className={singleButtonClass(active)}>
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </Button>
              </Link>
            )
          })}

          {officeNavCollapsibleSections.map((section) => {
            const isOpen = openGroups.has(section.id)
            const hasActiveChild = isCollapsibleSectionActive(section.id, pathname)
            const Icon = section.icon
            return (
              <div key={section.id} className="space-y-1">
                <Button variant="ghost" onClick={() => toggleGroup(section.id)} className={groupHeaderButtonClass(hasActiveChild)}>
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="truncate">{section.label}</span>
                  </div>
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                </Button>

                {isOpen ? (
                  <div className="ml-4 space-y-1">
                    {section.items.map((child) => {
                      const ChildIcon = child.icon
                      const active = isNavItemActive(pathname, child.href)
                      return (
                        <Link key={child.href} href={child.href} onClick={() => setSidebarOpen(false)}>
                          <Button variant="ghost" className={singleButtonClass(active)}>
                            <ChildIcon className="h-5 w-5 shrink-0" />
                            <span className="truncate">{child.name}</span>
                          </Button>
                        </Link>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}

          <Link href={officeNavPlatformLink.href} onClick={() => setSidebarOpen(false)}>
            <Button variant="ghost" className={singleButtonClass(isNavItemActive(pathname, officeNavPlatformLink.href))}>
              <PlatformNavIcon className="h-5 w-5 shrink-0" />
              <span className="truncate">{officeNavPlatformLink.name}</span>
            </Button>
          </Link>
        </nav>

        <div className="border-t border-sidebar-border px-4 py-4">
          <Button
            variant="ghost"
            className="h-auto w-full justify-start gap-3 px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="truncate">Logout</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden lg:ml-64">
        <div className="flex h-16 items-center border-b border-sidebar-border bg-background px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
        </div>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
