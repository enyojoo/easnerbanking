"use client"

import {
  YC_PAY_IN_AWAITING_DESCRIPTION_EXPIRED,
  formatYcPayInDepositTimeRemaining,
} from "@easner/shared"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"

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
      className={
        className ??
        "text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-500 text-center"
      }
    >
      {formatYcPayInDepositTimeRemaining(countdown.remainingMs)}
    </p>
  )
}
