"use client"

import type { ReactNode } from "react"
import { User } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { RecipientCornerFlagBadge } from "@/components/recipient-corner-flag-badge"
import { cn } from "@/lib/utils"

function recipientInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  )
}

type RecipientPayoutProfileRowProps = {
  fullName: string
  subtitle: ReactNode
  currency: string
  countryCode?: string | null
  avatarUrl?: string | null
  className?: string
  nameClassName?: string
  subtitleClassName?: string
}

/**
 * Bank / mobile / wallet recipient row — same avatar + circular corner badge as Easetag rows.
 */
export function RecipientPayoutProfileRow({
  fullName,
  subtitle,
  currency,
  countryCode,
  avatarUrl,
  className,
  nameClassName,
  subtitleClassName,
}: RecipientPayoutProfileRowProps) {
  const subtitleCn = subtitleClassName ?? "text-sm text-muted-foreground"
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="relative mr-1 shrink-0">
        {avatarUrl ? (
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={avatarUrl} alt="" />
            <AvatarFallback>{recipientInitials(fullName)}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
        )}
        <RecipientCornerFlagBadge countryCode={countryCode} currency={currency} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", nameClassName)}>{fullName}</p>
        <div className={cn("min-w-0 truncate", subtitleCn)}>{subtitle}</div>
      </div>
    </div>
  )
}
