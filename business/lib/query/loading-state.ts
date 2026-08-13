"use client"

import { useIsRestoring } from "@tanstack/react-query"

/**
 * True when a query surface should show a first-load skeleton.
 * Mirrors packages/shared/src/query/ux-rules.ts (skeleton.firstLoadOnly).
 */
export function isQueryFirstLoad(
  query: { isPending: boolean; data: unknown },
  opts?: { isRestoring?: boolean },
): boolean {
  return query.isPending && query.data === undefined && !opts?.isRestoring
}

/**
 * True when a query has finished loading and the collection is genuinely empty.
 * Do not use while isPending or during persist restore.
 */
export function isQueryTrulyEmpty(
  query: { isPending: boolean; isFetched?: boolean; data?: unknown },
  isEmpty: (data: unknown) => boolean,
  opts?: { isRestoring?: boolean },
): boolean {
  if (opts?.isRestoring || query.isPending) return false
  if (!query.isFetched && query.data === undefined) return false
  return isEmpty(query.data)
}

/** Hook wrapper that folds in React Query persist restore state. */
export function useQueryFirstLoad(
  query: { isPending: boolean; data: unknown },
): boolean {
  const isRestoring = useIsRestoring()
  return isQueryFirstLoad(query, { isRestoring })
}
