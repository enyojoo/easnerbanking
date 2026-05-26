"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, LogOut, Menu, X } from "lucide-react"
import { BrandLogo } from "@easner/shared"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { clearBrowserQueryClient } from "@/lib/query/query-client"
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
    "w-full justify-start gap-3 px-3 py-2.5 h-auto text-[13px] rounded-xl transition-[background-color,color,box-shadow,border-color] duration-200",
    active
      ? "bg-card text-foreground font-semibold shadow-card border border-border/70 [&_svg]:text-primary"
      : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent",
  )

const groupHeaderButtonClass = (hasActiveChild: boolean) =>
  cn(
    "w-full justify-between gap-3 px-3 py-2.5 h-auto text-[13px] rounded-xl transition-[background-color,color,box-shadow,border-color] duration-200",
    hasActiveChild
      ? "bg-card text-foreground font-semibold shadow-card border border-border/70 [&_svg]:text-primary"
      : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent",
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
      clearBrowserQueryClient()
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
          <div
            className="fixed inset-0 bg-[hsl(var(--brand-graphite)/0.6)] backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <div
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-64 border-r border-sidebar-border bg-sidebar flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-6">
          <Link
            href="/dashboard"
            className="inline-flex min-w-0 items-center"
            onClick={() => setSidebarOpen(false)}
          >
            <BrandLogo size="lg" className="h-8 w-auto max-w-[10rem]" />
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-6">
          {officeNavPrimaryLinks.map((item) => {
            const Icon = item.icon
            const active = isNavItemActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                aria-current={active ? "page" : undefined}
              >
                <Button variant="ghost" className={singleButtonClass(active)}>
                  <Icon className="h-[18px] w-[18px] shrink-0 stroke-[1.5]" />
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
                    <Icon className="h-[18px] w-[18px] shrink-0 stroke-[1.5]" />
                    <span className="truncate">{section.label}</span>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </Button>

                {isOpen ? (
                  <div className="ml-4 space-y-1 border-l border-border/60 pl-2">
                    {section.items.map((child) => {
                      const ChildIcon = child.icon
                      const active = isNavItemActive(pathname, child.href)
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setSidebarOpen(false)}
                          aria-current={active ? "page" : undefined}
                        >
                          <Button variant="ghost" className={singleButtonClass(active)}>
                            <ChildIcon className="h-[18px] w-[18px] shrink-0 stroke-[1.5]" />
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

          <Link
            href={officeNavPlatformLink.href}
            onClick={() => setSidebarOpen(false)}
            aria-current={isNavItemActive(pathname, officeNavPlatformLink.href) ? "page" : undefined}
          >
            <Button variant="ghost" className={singleButtonClass(isNavItemActive(pathname, officeNavPlatformLink.href))}>
              <PlatformNavIcon className="h-[18px] w-[18px] shrink-0 stroke-[1.5]" />
              <span className="truncate">{officeNavPlatformLink.name}</span>
            </Button>
          </Link>
        </nav>

        <div className="mt-auto border-t border-sidebar-border px-3 py-4">
          <Button
            variant="ghost"
            className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0 stroke-[1.5]" />
            <span className="truncate">Logout</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden lg:ml-64">
        <div className="flex h-16 items-center border-b border-border/60 bg-background/80 px-4 backdrop-blur sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex-1" />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
