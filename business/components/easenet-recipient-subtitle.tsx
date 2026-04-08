"use client"

import { cn } from "@/lib/utils"
import type { PayeeAccountKind } from "@/lib/easner-brand"

function normalizeEasetag(easetag: string | undefined | null): string {
  return String(easetag || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
}

/** `Business` • `@tag` with the bullet vertically centered between label and handle. */
export function EasenetRecipientSubtitle({
  easetag,
  accountKind,
  className,
}: {
  easetag: string | undefined | null
  accountKind?: PayeeAccountKind | null
  className?: string
}) {
  const tag = normalizeEasetag(easetag)
  if (!tag) return null
  const label = accountKind === "business" ? "Business" : "Personal"
  return (
    <span className={cn("flex min-w-0 items-center", className)}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 px-1.5" aria-hidden>
        •
      </span>
      <span className="shrink-0">@{tag}</span>
    </span>
  )
}
