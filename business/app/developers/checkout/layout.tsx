"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/developers/checkout", label: "Quickstart" },
  { href: "/developers/checkout/api", label: "API reference" },
  { href: "/developers/checkout/webhooks", label: "Webhooks" },
] as const

export default function CheckoutDocsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Link href="/developers" className="transition-colors hover:text-foreground">
            Developers
          </Link>
          {" · "}Easner Checkout
        </p>
        <nav aria-label="Checkout documentation" className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                pathname === tab.href
                  ? "border-primary bg-primary/5 font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  )
}
