"use client"

import type React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { TransactionDetailsPanel } from "@/components/transaction-details-panel"
import { findCachedTransactionForDetail, useTransactionDetail } from "@/hooks/queries/use-transactions"
import { useQueryFirstLoad } from "@/lib/query/loading-state"
import { formatUserFacingFetchError, isFatalQueryFailure } from "@/lib/query/fetch-errors"
import { useScope } from "@/lib/query/scope"
import {
  normalizeEasnerTransactionIdForLookup,
  resolveTransactionDetailReturnPath,
} from "@/lib/easner-transaction-id"

import { ArrowLeft, Loader2 } from "lucide-react"

/**
 * Transaction detail content, shared by two mount points:
 *   1. the real `/transactions/[etid]` route (deep links, hard loads)
 *   2. the DashboardShell client-detail overlay — in-app row clicks navigate
 *      with shallow `history.pushState`, so opening a transaction is a pure
 *      client-side swap with NO server round trip (the dynamic route used to
 *      cost a full RSC fetch per click).
 * Takes the already-decoded URL segment instead of reading `useParams()`,
 * because params are not populated for shallow pushState navigations.
 */
export function TransactionDetailView({ rawId }: { rawId: string }) {
  const decoded = rawId.trim()
  /** URL uses `etid55613389`; API + React Query key use canonical `ETID55613389`. */
  const lookupId = normalizeEasnerTransactionIdForLookup(decoded) ?? decoded
  const idForQuery = lookupId.trim() || null
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const returnPath = resolveTransactionDetailReturnPath(searchParams.get("returnTo"))
  const handleBack = () => {
    if (returnPath) router.replace(returnPath)
    else router.back()
  }
  const detailQuery = useTransactionDetail(idForQuery)
  const { data, error, refetch } = detailQuery
  const cachedFallback =
    idForQuery ? findCachedTransactionForDetail(queryClient, idForQuery, scope) : undefined
  // Prefer live query data; fall back to list/detail cache on refresh blips — no soft error UI.
  const resolvedTransaction = data ?? cachedFallback ?? null
  const firstLoad = useQueryFirstLoad(detailQuery)
  const fatalError = isFatalQueryFailure(detailQuery) && !resolvedTransaction

  if (!decoded || !idForQuery) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" type="button" onClick={handleBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Transaction</h1>
        </div>
        <p className="text-sm text-muted-foreground">This transaction link is invalid or incomplete.</p>
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link href="/transactions">Back to all transactions</Link>
        </Button>
      </div>
    )
  }

  const showLoading = firstLoad && !fatalError

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" type="button" onClick={handleBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Transaction</h1>
        </div>
      </div>

      {showLoading ?
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      : fatalError ?
        <div className="space-y-3">
          <p className="text-sm text-destructive">
            {formatUserFacingFetchError(error, "Could not load transaction")}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      : (
        <TransactionDetailsPanel
          transaction={resolvedTransaction as React.ComponentProps<typeof TransactionDetailsPanel>["transaction"]}
          omitTrackStatus
        />
      )}

      <Button variant="outline" asChild className="w-full sm:w-auto">
        <Link href="/transactions">Back to all transactions</Link>
      </Button>
    </div>
  )
}

/**
 * `/transactions/<segment>` (exactly one extra segment) is the detail route.
 * Returns the DECODED segment, or null when `pathname` is not a detail path.
 */
export function parseTransactionDetailPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const match = /^\/transactions\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
