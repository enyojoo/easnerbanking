"use client"

import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { TransactionDetailsPanel } from "@/components/transaction-details-panel"
import { useTransactionDetail } from "@/hooks/queries/use-transactions"
import {
  normalizeEasnerTransactionIdForLookup,
  resolveTransactionDetailReturnPath,
} from "@/lib/easner-transaction-id"
import { ArrowLeft, Loader2 } from "lucide-react"

export default function TransactionDetailByEtidPage() {
  const params = useParams()
  const raw = params.etid
  const decoded = typeof raw === "string" ? decodeURIComponent(raw.trim()) : ""
  /** URL uses `etid55613389`; API + React Query key use canonical `ETID55613389`. */
  const lookupId = normalizeEasnerTransactionIdForLookup(decoded) ?? decoded
  const idForQuery = lookupId.trim() || null
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnPath = resolveTransactionDetailReturnPath(searchParams.get("returnTo"))
  const handleBack = () => {
    if (returnPath) router.replace(returnPath)
    else router.back()
  }
  const { data, isError, error } = useTransactionDetail(idForQuery)

  if (!decoded.trim() || !idForQuery) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
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

  const showLoading = !data && !isError

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
      : isError ?
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load transaction"}
        </p>
      : (
        <TransactionDetailsPanel transaction={data ?? null} omitTrackStatus />
      )}

      <Button variant="outline" asChild className="w-full sm:w-auto">
        <Link href="/transactions">Back to all transactions</Link>
      </Button>
    </div>
  )
}
