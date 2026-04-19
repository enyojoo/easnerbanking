"use client"

import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Subtle "pending" pill for optimistic rows (e.g. a transfer that's been
 * submitted but not yet posted by the server). Appears alongside the row
 * content; the row remains fully readable so the user keeps trust.
 *
 * Rule: optimistic styling must NEVER imply the transfer is final. Keep
 * the badge quiet, not celebratory.
 */
export function PendingBadge({ className, label = "Pending" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      <Clock className="size-3" aria-hidden />
      {label}
    </span>
  )
}
