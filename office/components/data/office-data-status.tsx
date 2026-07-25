"use client"

import { useIsFetching, useIsMutating } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function OfficeDataActivity({ className }: { className?: string }) {
  const fetching = useIsFetching({ queryKey: ["office"] })
  const mutating = useIsMutating()
  const active = fetching > 0 || mutating > 0

  return (
    <div
      aria-hidden={!active}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden transition-opacity",
        active ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <div className="h-full w-1/3 animate-[office-data-progress_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
    </div>
  )
}

export function OfficeBackgroundRefresh({
  isFetching,
  label = "Updating",
  className,
}: {
  isFetching: boolean
  label?: string
  className?: string
}) {
  if (!isFetching) return null
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      <RefreshCw className="h-3 w-3 animate-spin" />
      {label}
    </span>
  )
}

export function OfficeQueryError({
  message,
  onRetry,
  hasData = false,
}: {
  message: string | null
  onRetry?: () => void
  hasData?: boolean
}) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3"
    >
      <div>
        <p className="text-sm font-medium text-destructive">
          {hasData ? "Couldn’t refresh this data" : "Couldn’t load this data"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
