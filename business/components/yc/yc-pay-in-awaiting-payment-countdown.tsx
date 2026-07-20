"use client"

import {
  YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED,
  YC_PAY_IN_REVIEW_PAYMENT_WINDOW_EXPIRED,
  formatYcPayInPaymentCountdownFromExpiry,
} from "@easner/shared"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"
import { cn } from "@/lib/utils"

type Props = {
  depositExpiresAt?: string | null
  className?: string
  /** Review & Complete uses restart copy; detail/sheet uses support copy. */
  context?: "review" | "detail"
}

export function YcPayInAwaitingPaymentCountdown({
  depositExpiresAt,
  className,
  context = "detail",
}: Props) {
  const countdown = useQuoteCountdown(depositExpiresAt)
  if (!depositExpiresAt) return null

  if (countdown.expired) {
    const expiredCopy =
      context === "review"
        ? YC_PAY_IN_REVIEW_PAYMENT_WINDOW_EXPIRED
        : YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED
    return (
      <p className={className ?? "text-sm text-destructive text-center"}>
        {expiredCopy}
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
