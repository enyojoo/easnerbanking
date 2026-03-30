"use client"

import { cn } from "@/lib/utils"

export function PinUserAvatar({ initials, className }: { initials: string; className?: string }) {
  const safe = initials.slice(0, 2).toUpperCase() || "?"
  return (
    <div
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground",
        className,
      )}
    >
      {safe}
    </div>
  )
}
