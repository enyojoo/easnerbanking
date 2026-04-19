"use client"

import * as React from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Inline error for a data-backed card/section.
 *
 * Rule: NEVER replace the whole surface with an error screen while we have
 * any cached state. Render this compact banner above/below the last-known
 * data instead — the user can still read numbers while we reconcile.
 *
 * Use the full-screen error only for routes that have truly never rendered
 * (first load failure, no SSR snapshot).
 */

type Props = {
  title?: string
  message?: string | null
  onRetry?: () => void
  isRetrying?: boolean
  className?: string
}

export function InlineCardError({
  title = "Couldn't refresh",
  message,
  onRetry,
  isRetrying,
  className,
}: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-amber-900",
        "dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium leading-tight">{title}</span>
        {message ? (
          <span className="text-xs text-amber-900/80 dark:text-amber-100/80">{message}</span>
        ) : null}
      </div>
      {onRetry ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="h-7 text-amber-900 hover:bg-amber-500/10 dark:text-amber-100"
        >
          <RefreshCw className={cn("mr-1 size-3", isRetrying && "animate-spin")} aria-hidden />
          Retry
        </Button>
      ) : null}
    </div>
  )
}
