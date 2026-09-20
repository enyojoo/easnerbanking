"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { FileText, KeyRound, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConsoleModeSwitch } from "@/components/console/console-mode-switch"
import { cn } from "@/lib/utils"

const ACTIONS = [
  { href: "/console/keys", label: "Keys", icon: KeyRound },
  { href: "/console/webhooks", label: "Webhooks", icon: Radio },
  { href: "/checkout", label: "Checkout" },
  { href: "/console/logs", label: "Logs", icon: FileText },
  { href: "/console/events", label: "Events" },
] as const

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function ConsoleWorkspaceActions({ className }: { className?: string }) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const onHome = pathname === "/console"

  return (
    <div className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2", className)}>
      {ACTIONS.map((action) => {
        const active = isActivePath(pathname, action.href)
        const primary = onHome ? action.href === "/console/keys" : active
        const Icon = "icon" in action ? action.icon : null
        return (
          <Button
            key={action.href}
            asChild
            size="sm"
            variant={primary ? "default" : "outline"}
            className={primary ? "shadow-sm" : undefined}
          >
            <Link href={search ? `${action.href}?${search}` : action.href} className="flex items-center gap-2">
              {Icon ? <Icon className="h-4 w-4" /> : null}
              {action.label}
            </Link>
          </Button>
        )
      })}
      <ConsoleModeSwitch />
    </div>
  )
}
