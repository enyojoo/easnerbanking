"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/payroll", label: "Overview", exact: true },
  { href: "/payroll/people", label: "People" },
  { href: "/payroll/runs", label: "Runs" },
  { href: "/payroll/schedules", label: "Schedules" },
]

export function PayrollNavTabs() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-2 border-b border-border/70 pb-3 mb-6">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
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
