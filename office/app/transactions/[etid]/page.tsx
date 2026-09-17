"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OfficeTransactionDetailPanel } from "@/components/transactions/office-transaction-detail-panel"
import { OfficePageSkeleton } from "@/components/data/office-page-skeleton"
import { OfficeQueryError } from "@/components/data/office-data-status"
import { useOfficeTransactionDetail } from "@/hooks/queries"

function OfficeTransactionDetailInner() {
  const params = useParams<{ etid: string }>()
  const raw = typeof params.etid === "string" ? decodeURIComponent(params.etid.trim()) : ""
  const query = useOfficeTransactionDetail(raw)

  return (
    <div className="p-6 space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 h-8 gap-1 px-2 text-muted-foreground">
          <Link href="/transactions">
            <ArrowLeft className="h-3.5 w-3.5" />
            Transactions
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Transaction details</h1>
      </div>

      <OfficeQueryError
        message={query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null}
        hasData={Boolean(query.data)}
        onRetry={() => void query.refetch()}
      />

      {query.isPending && !query.data ? <OfficePageSkeleton cards={2} rows={8} /> : null}

      {query.data ? <OfficeTransactionDetailPanel detail={query.data} /> : null}

      {!query.isPending && !query.data && !query.error ? (
        <p className="text-sm text-muted-foreground">Transaction not found.</p>
      ) : null}
    </div>
  )
}

export default function OfficeTransactionDetailPage() {
  return (
    <Suspense fallback={<OfficePageSkeleton cards={2} rows={8} />}>
      <OfficeTransactionDetailInner />
    </Suspense>
  )
}
