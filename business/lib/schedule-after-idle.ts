/** Run work after first paint without blocking hydration. */
export function scheduleAfterIdle(callback: () => void, timeoutMs = 2000): () => void {
  if (typeof window === "undefined") return () => {}

  const w = window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number
    cancelIdleCallback?: (id: number) => void
  }

  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(() => callback(), { timeout: timeoutMs })
    return () => w.cancelIdleCallback?.(id)
  }

  const timeout = window.setTimeout(callback, Math.min(timeoutMs, 250))
  return () => window.clearTimeout(timeout)
}
