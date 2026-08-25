import { describe, expect, it } from "vitest"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { createBaseQueryClient, refetchOnMountWhenInvalidated } from "./client"

/**
 * Pins the invalidated-while-away behavior against the installed TanStack
 * version. The realtime bridge and mutations invalidate with
 * `refetchType: "active"`, which marks INACTIVE queries invalidated without
 * refetching them; a plain `refetchOnMount: false` then ignores the
 * invalidation on remount (shouldFetchOn short-circuits before isStale).
 * These tests fail loudly if a dependency bump changes that contract.
 */

const KEY = ["contract", "refetch-on-mount"] as const

function makeFetcher() {
  let calls = 0
  return {
    fn: async () => {
      calls += 1
      return calls
    },
    get calls() {
      return calls
    },
  }
}

async function mountOnce(qc: QueryClient, queryFn: () => Promise<number>) {
  const observer = new QueryObserver(qc, {
    queryKey: KEY,
    queryFn,
    staleTime: 60_000,
  })
  const unsubscribe = observer.subscribe(() => {})
  // Allow the mount fetch (if any) to settle.
  await new Promise((resolve) => setTimeout(resolve, 10))
  unsubscribe()
}

describe("refetchOnMountWhenInvalidated", () => {
  it("returns 'always' only for invalidated queries", () => {
    expect(refetchOnMountWhenInvalidated({ state: { isInvalidated: true } })).toBe("always")
    expect(refetchOnMountWhenInvalidated({ state: { isInvalidated: false } })).toBe(false)
  })

  it("does not refetch fresh, non-invalidated data on remount (cache-first)", async () => {
    const qc = createBaseQueryClient()
    const fetcher = makeFetcher()
    await qc.prefetchQuery({ queryKey: KEY, queryFn: fetcher.fn, staleTime: 60_000 })
    expect(fetcher.calls).toBe(1)

    await mountOnce(qc, fetcher.fn)
    expect(fetcher.calls).toBe(1)
  })

  it("refetches on remount after an inactive invalidation (refetchType: 'active')", async () => {
    const qc = createBaseQueryClient()
    const fetcher = makeFetcher()
    await qc.prefetchQuery({ queryKey: KEY, queryFn: fetcher.fn, staleTime: 60_000 })
    expect(fetcher.calls).toBe(1)

    // No observers mounted: this marks the query invalidated without refetching.
    await qc.invalidateQueries({ queryKey: KEY, refetchType: "active" })
    expect(fetcher.calls).toBe(1)
    expect(qc.getQueryState(KEY)?.isInvalidated).toBe(true)

    await mountOnce(qc, fetcher.fn)
    expect(fetcher.calls).toBe(2)
    expect(qc.getQueryState(KEY)?.isInvalidated).toBe(false)
  })

  it("documents the trap this replaces: refetchOnMount: false loses the invalidation", async () => {
    const qc = createBaseQueryClient({
      defaultOptions: { queries: { refetchOnMount: false } },
    })
    const fetcher = makeFetcher()
    await qc.prefetchQuery({ queryKey: KEY, queryFn: fetcher.fn, staleTime: 60_000 })
    await qc.invalidateQueries({ queryKey: KEY, refetchType: "active" })

    await mountOnce(qc, fetcher.fn)
    // Still 1: the invalidation was silently dropped. If a TanStack upgrade
    // changes this to 2, refetchOnMountWhenInvalidated may no longer be needed.
    expect(fetcher.calls).toBe(1)
  })
})
