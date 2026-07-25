"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { isNavPathActive } from "@/lib/navigation/is-nav-path-active"

const tabs = [
  { href: "/payroll", label: "Overview", exact: true },
  { href: "/payroll/people", label: "People" },
  { href: "/payroll/runs", label: "Runs" },
  { href: "/payroll/schedules", label: "Schedules" },
  { href: "/payroll/settings", label: "Settings" },
]

export function PayrollNavTabs() {
  const pathname = usePathname()

  return (
    <nav aria-label="Payroll" className="mb-6 flex gap-1 overflow-x-auto border-b border-border/70 pb-3">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : isNavPathActive(pathname, tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-soft border border-border/70"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
