"use client"

import { useCallback, useEffect, useRef, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Plus, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PayrollPermissionAction } from "@/components/payroll/payroll-permission-action"
import {
  PAYROLL_WORKSPACE_TABS,
  payrollWorkspaceTabForPath,
  type PayrollWorkspaceTabConfig,
} from "@/components/payroll/payroll-workspace-config"
import {
  payrollOverviewQueryOptions,
  payrollPeopleQueryOptions,
  payrollRunsQueryOptions,
  payrollSchedulesQueryOptions,
  payrollSettingsQueryOptions,
  usePayrollCapabilities,
} from "@/hooks/queries/use-payroll"
import { useScope } from "@/lib/query/scope"
import { cn } from "@/lib/utils"
import { analytics } from "@/lib/analytics"

export function PayrollWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const activeTab = payrollWorkspaceTabForPath(pathname)
  if (!activeTab) return children
  return (
    <PayrollWorkspaceContent activeTab={activeTab} pathname={pathname}>
      {children}
    </PayrollWorkspaceContent>
  )
}

function PayrollWorkspaceContent({
  activeTab,
  pathname,
  children,
}: {
  activeTab: PayrollWorkspaceTabConfig
  pathname: string
  children: ReactNode
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const capabilitiesQuery = usePayrollCapabilities()
  const canPrepare = Boolean(capabilitiesQuery.data?.canPrepare)
  const activeTabRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    activeTabRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    })
  }, [pathname])

  useEffect(() => {
    if (activeTab) analytics.track("payroll_opened", { section: activeTab.id })
  }, [activeTab])

  const prefetchTab = useCallback((tabId: (typeof PAYROLL_WORKSPACE_TABS)[number]["id"], href: string) => {
    router.prefetch(href)
    if (!scope) return
    if (tabId === "overview") void queryClient.prefetchQuery(payrollOverviewQueryOptions(scope))
    if (tabId === "people") void queryClient.prefetchQuery(payrollPeopleQueryOptions(scope))
    if (tabId === "runs") void queryClient.prefetchQuery(payrollRunsQueryOptions(scope))
    if (tabId === "schedules") void queryClient.prefetchQuery(payrollSchedulesQueryOptions(scope))
    if (tabId === "settings") void queryClient.prefetchQuery(payrollSettingsQueryOptions(scope))
  }, [queryClient, router, scope])

  useEffect(() => {
    if (!scope) return
    const preload = () => {
      for (const tab of PAYROLL_WORKSPACE_TABS) {
        if (tab.id !== activeTab.id) prefetchTab(tab.id, tab.href)
      }
    }
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload, { timeout: 1800 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(preload, 600)
    return () => clearTimeout(id)
  }, [activeTab, prefetchTab, scope])

  const primary = activeTab.primaryAction
  const secondary = activeTab.secondaryActions ?? []

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payroll</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{activeTab.description}</p>
        </div>
        {primary || secondary.length ? (
          <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2">
            {activeTab.id === "overview" && secondary.length > 1 ? (
              <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Add
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {secondary.map((action) => (
                      <DropdownMenuItem key={action.href} asChild>
                        <Link href={action.href}>{action.label}</Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </PayrollPermissionAction>
            ) : (
              secondary.map((action) => (
                <PayrollPermissionAction
                  key={action.href}
                  allowed={canPrepare}
                  loading={capabilitiesQuery.isPending}
                >
                  <Button variant="outline" asChild>
                    <Link href={action.href}>
                      {action.label === "Import people" ? <Upload className="mr-2 h-4 w-4" /> : null}
                      {action.label}
                    </Link>
                  </Button>
                </PayrollPermissionAction>
              ))
            )}
            {primary ? (
              <PayrollPermissionAction allowed={canPrepare} loading={capabilitiesQuery.isPending}>
                <Button asChild>
                  <Link href={primary.href}>
                    <Plus className="mr-2 h-4 w-4" />
                    {primary.label}
                  </Link>
                </Button>
              </PayrollPermissionAction>
            ) : null}
          </div>
        ) : null}
      </header>

      <nav
        aria-label="Payroll sections"
        className="overflow-x-auto border-b border-border/70 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-w-max gap-6">
          {PAYROLL_WORKSPACE_TABS.map((tab) => {
            const active = tab.id === activeTab.id
            return (
              <Link
                key={tab.id}
                ref={active ? activeTabRef : undefined}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                onPointerEnter={() => prefetchTab(tab.id, tab.href)}
                onFocus={() => prefetchTab(tab.id, tab.href)}
                onTouchStart={() => prefetchTab(tab.id, tab.href)}
                className={cn(
                  "relative flex min-h-11 shrink-0 items-center px-0.5 text-sm font-medium transition-colors duration-200",
                  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:transition-transform after:duration-200 motion-reduce:after:transition-none",
                  active
                    ? "text-foreground after:scale-x-100 after:bg-primary"
                    : "text-muted-foreground after:scale-x-0 hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {capabilitiesQuery.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <span>We couldn’t check your Payroll permissions. Your payroll data is still available.</span>
          <Button variant="outline" size="sm" onClick={() => void capabilitiesQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div key={activeTab.id} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
        {children}
      </div>
    </div>
  )
}
