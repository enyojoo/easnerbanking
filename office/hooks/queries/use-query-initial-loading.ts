"use client"

/** True while the first fetch is in flight and there is no cached data to show. */
export function useQueryInitialLoading<T>(
  isPending: boolean,
  data: T | undefined,
  rows?: readonly unknown[] | null,
): boolean {
  if (rows && rows.length > 0) return false
  return isPending && data === undefined
}
