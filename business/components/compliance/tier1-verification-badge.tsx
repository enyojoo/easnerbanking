"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { verificationStatusLabel } from "@easner/shared"

/**
 * Compact Tier 1 (business KYB) status for headers – pairs with org name; matches tier-card semantics.
 */
const compactBadge = "text-[10px] leading-tight px-1.5 py-px font-medium rounded"

export function Tier1VerificationBadge({
  tier1Complete,
  tier1VerificationStatus,
  isLoading,
  compact = false,
  className,
}: {
  tier1Complete: boolean
  tier1VerificationStatus: string | null
  isLoading?: boolean
  /** Smaller badge for sidebar under org name */
  compact?: boolean
  className?: string
}) {
  const sizeClass = compact ? compactBadge : "text-xs"

  if (isLoading) {
    return (
      <div
        className={cn(
          "shrink-0 animate-pulse rounded bg-muted",
          compact ? "h-3.5 w-14" : "h-5 w-[4.5rem]",
          className,
        )}
        aria-hidden
      />
    )
  }

  const label = verificationStatusLabel(tier1VerificationStatus, {
    complete: tier1Complete,
  })

  if (tier1Complete) {
    return (
      <Badge
        className={cn(
          "shrink-0 border-transparent bg-success font-medium text-success-foreground hover:bg-success",
          sizeClass,
          className,
        )}
      >
        {label}
      </Badge>
    )
  }

  const s = (tier1VerificationStatus || "").toLowerCase()
  if (s === "in_progress") {
    return (
      <Badge variant="outline" className={cn("shrink-0 font-medium text-foreground", sizeClass, className)}>
        {label}
      </Badge>
    )
  }
  if (s.includes("review") || s === "pending" || s === "in_review" || s === "under_review") {
    return (
      <Badge variant="secondary" className={cn("shrink-0 font-medium", sizeClass, className)}>
        {label}
      </Badge>
    )
  }
  if (s === "rejected" || s === "hold") {
    return (
      <Badge variant="destructive" className={cn("shrink-0 font-medium", sizeClass, className)}>
        {label}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className={cn("shrink-0 font-medium text-muted-foreground", sizeClass, className)}>
      {label}
    </Badge>
  )
}
