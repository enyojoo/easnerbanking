"use client"

import { User } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { EasenetRecipientSubtitle } from "@/components/easenet-recipient-subtitle"
import { EASNER_MARK_URL } from "@/lib/easner-brand"
import type { PayeeAccountKind } from "@/lib/easner-brand"
import { cn } from "@/lib/utils"

function easenetInitials(name: string): string {
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

/**
 * Send-flow easetag row: photo (or user fallback) + Easner mark badge + name + Business/Personal • @tag.
 */
export function EasenetRecipientProfileRow({
  fullName,
  easetag,
  accountKind,
  avatarUrl,
  className,
  textColClassName,
  nameClassName,
  subtitleClassName,
  subtitleWrapperClassName,
}: {
  fullName: string
  easetag: string
  accountKind?: PayeeAccountKind | null
  avatarUrl?: string | null
  className?: string
  textColClassName?: string
  nameClassName?: string
  /** Classes for Business • @tag (default `text-sm text-muted-foreground`) */
  subtitleClassName?: string
  subtitleWrapperClassName?: string
}) {
  const subtitleCn = subtitleClassName ?? "text-sm text-muted-foreground"
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="relative mr-1 shrink-0">
        {avatarUrl ? (
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={avatarUrl} alt="" loading="eager" fetchPriority="high" />
            <AvatarFallback>{easenetInitials(fullName)}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 overflow-hidden rounded-full border-2 border-background bg-background p-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={EASNER_MARK_URL}
            alt=""
            className="size-full object-cover"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </div>
      </div>
      <div className={cn("min-w-0 flex-1", textColClassName)}>
        <p className={cn("truncate font-medium", nameClassName)}>{fullName}</p>
        <div className={cn("min-w-0", subtitleWrapperClassName)}>
          <EasenetRecipientSubtitle easetag={easetag} accountKind={accountKind} className={subtitleCn} />
        </div>
      </div>
    </div>
  )
}
