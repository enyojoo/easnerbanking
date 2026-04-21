"use client"

import { formatLockCountdown } from "@/lib/pin-lock-countdown"
import { cn } from "@/lib/utils"

type Props = {
  msRemaining: number
  className?: string
  variant?: "muted" | "destructive"
}

/**
 * Stable-width lock copy: prefix + fixed slot for `mm:ss` (tabular + mono) so ticks don’t shift layout.
 */
export function PinLockedHint({ msRemaining, className, variant = "muted" }: Props) {
  const tone = variant === "destructive" ? "text-destructive" : "text-muted-foreground"
  return (
    <p
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-0 text-center text-sm",
        tone,
        className,
      )}
    >
      <span>PIN locked. Try again in </span>
      <span
        className={cn(
          "inline-flex min-w-[3.35rem] justify-center font-mono tabular-nums",
          tone,
        )}
        aria-live="polite"
      >
        {formatLockCountdown(msRemaining)}
      </span>
    </p>
  )
}
