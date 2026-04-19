"use client"

import * as React from "react"
import { UX } from "@easner/shared"
import { cn } from "@/lib/utils"

/**
 * Small "Updated Xs ago" label for data-driven surfaces.
 *
 * Rules:
 *   - Never render until data has been old for `UX.refreshHint.showWhenUpdatedAtOlderThanMs`,
 *     so fresh data stays visually clean.
 *   - Switches to a warning tone past `UX.refreshHint.staleThresholdMs`.
 *   - Re-renders every 30s to keep the label honest without being chatty.
 */

type Props = {
  dataUpdatedAt: number | undefined
  isFetching?: boolean
  className?: string
}

function formatAge(ageMs: number): string {
  const s = Math.round(ageMs / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

export function RefreshedAt({ dataUpdatedAt, isFetching, className }: Props) {
  const [, force] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    const id = setInterval(() => force(), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!dataUpdatedAt) return null
  const age = Date.now() - dataUpdatedAt
  if (age < UX.refreshHint.showWhenUpdatedAtOlderThanMs && !isFetching) return null
  const stale = age >= UX.refreshHint.staleThresholdMs
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        className,
      )}
    >
      {isFetching ? (
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
      ) : null}
      Updated {formatAge(age)}
    </span>
  )
}
