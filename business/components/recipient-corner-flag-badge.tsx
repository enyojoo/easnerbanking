"use client"

import { CountryFlag, CurrencyFlag } from "@/components/flags"
import { cn } from "@/lib/utils"

const flagCropClass =
  "size-full min-h-0 min-w-0 rounded-full [&_img]:size-full [&_img]:rounded-full [&_img]:object-cover [&_img]:object-center"

type RecipientCornerFlagBadgeProps = {
  countryCode?: string | null
  currency: string
  className?: string
}

/**
 * Circular corner badge on recipient avatars (bank / mobile / wallet).
 * Matches EasenetRecipientProfileRow easner-mark badge (20px circle, bottom-right).
 */
export function RecipientCornerFlagBadge({
  countryCode,
  currency,
  className,
}: RecipientCornerFlagBadgeProps) {
  const cc = String(countryCode || "").trim().toUpperCase()
  return (
    <div
      className={cn(
        "absolute -bottom-0.5 -right-0.5 h-5 w-5 overflow-hidden rounded-full border-2 border-background bg-background p-0",
        className,
      )}
      aria-hidden
    >
      {cc ? (
        <CountryFlag code={cc} className={flagCropClass} title={cc} />
      ) : (
        <CurrencyFlag currency={currency} className={flagCropClass} title={currency} />
      )}
    </div>
  )
}
