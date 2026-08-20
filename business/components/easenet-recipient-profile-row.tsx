"use client"

import { User } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { EasenetRecipientSubtitle } from "@/components/easenet-recipient-subtitle"
import type { PayeeAccountKind } from "@/lib/easner-brand"
import { cn } from "@/lib/utils"
import { normalizeProfileImageUrl } from "@/lib/image-cache"

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

/** Easetag row – profile photo or initials + name + subtitle (no corner mark). */
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
  subtitleClassName?: string
  subtitleWrapperClassName?: string
}) {
  const photoUrl = normalizeProfileImageUrl(avatarUrl)
  const subtitleCn = subtitleClassName ?? "text-sm text-muted-foreground"
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="relative mr-1 shrink-0">
        {photoUrl ? (
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage
              src={photoUrl}
              alt=""
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <AvatarFallback>{easenetInitials(fullName)}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
        )}
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
