"use client"

import {
  YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED,
  formatYcPayInPaymentCountdownFromExpiry,
} from "@easner/shared"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"
import { cn } from "@/lib/utils"

type Props = {
  depositExpiresAt?: string | null
  className?: string
}

export function YcPayInAwaitingPaymentCountdown({ depositExpiresAt, className }: Props) {
  const countdown = useQuoteCountdown(depositExpiresAt)
  if (!depositExpiresAt) return null

  if (countdown.expired) {
    return (
      <p className={className ?? "text-sm text-destructive text-center"}>
        {YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED}
      </p>
    )
  }

  return (
    <p
      className={cn(
        "text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-500 text-center",
        className,
      )}
    >
      {formatYcPayInPaymentCountdownFromExpiry(depositExpiresAt, {
        nowMs: countdown.nowMs,
      })}
    </p>
  )
}
