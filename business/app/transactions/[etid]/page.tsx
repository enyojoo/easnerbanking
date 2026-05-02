"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { TransactionDetailsPanel } from "@/components/transaction-details-panel"
import { useTransactionDetail } from "@/hooks/queries/use-transactions"
import { ArrowLeft, Loader2 } from "lucide-react"

export default function TransactionDetailByEtidPage() {
  const params = useParams()
  const raw = params.etid
  const etid = typeof raw === "string" ? decodeURIComponent(raw.trim()) : ""
  const router = useRouter()
  const { data, isLoading, isError, error } = useTransactionDetail(etid || null)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" type="button" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Transaction</h1>
          <p className="mt-1 text-sm text-muted-foreground">Details and status</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load transaction"}
        </p>
      ) : (
        <TransactionDetailsPanel transaction={data ?? null} omitTrackStatus />
      )}

      <Button variant="outline" asChild className="w-full sm:w-auto">
        <Link href="/transactions">Back to all transactions</Link>
      </Button>
    </div>
  )
}
