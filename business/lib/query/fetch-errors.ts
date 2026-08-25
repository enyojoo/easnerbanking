/** Detect browser/network failures that should retry or degrade gracefully. */
export function isTransientNetworkError(err: unknown): boolean {
  if (!err) return false
  if (typeof err === "object" && (err as { name?: string }).name === "AbortError") return true
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err)
  return /failed to fetch|networkerror|network request failed|load failed|aborted|timed out/i.test(
    message,
  )
}

/** Replace raw browser copy with something actionable when a hard (no-cache) error is shown. */
export function formatUserFacingFetchError(err: unknown, fallback = "Couldn’t load data"): string {
  if (!err) return fallback
  if (isTransientNetworkError(err)) {
    return "Connection interrupted. Check your network and try again."
  }
  if (err instanceof Error && err.message.trim()) return err.message
  return fallback
}

/**
 * True when a query failed and has nothing to render.
 * Background refresh failures with cached data should stay silent (stale-while-revalidate).
 */
export function isFatalQueryFailure(query: {
  isError: boolean
  data: unknown
}): boolean {
  return query.isError && query.data === undefined
}
