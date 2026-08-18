"use client"

import { useEffect, useState } from "react"
import { formatMoneyDisplay } from "@easner/shared"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"

type TestPayment = {
  id: string
  source: "embed" | "payment_link"
  amountCents: number
  currency: string
  customerEmail: string | null
  completedAt: string | null
}

export function CheckoutTestPaymentsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payments, setPayments] = useState<TestPayment[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchWithSession("/api/checkout/test-payments")
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          payments?: TestPayment[]
          error?: string
        }
        if (cancelled) return
        if (!res.ok) {
          setError(body.error || COLLECTIONS_COPY.testPaymentsLoadError)
          setPayments([])
          return
        }
        setPayments(Array.isArray(body.payments) ? body.payments : [])
      })
      .catch(() => {
        if (!cancelled) {
          setError(COLLECTIONS_COPY.testPaymentsLoadError)
          setPayments([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{COLLECTIONS_COPY.testPaymentsTitle}</DialogTitle>
          <DialogDescription>{COLLECTIONS_COPY.testPaymentsBlurb}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">{COLLECTIONS_COPY.testPaymentsLoading}</p>
        ) : error ? (
          <p className="text-sm text-destructive" role="status">
            {error}
          </p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{COLLECTIONS_COPY.testPaymentsEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px]">
              <thead className="border-b">
                <tr>
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                    {COLLECTIONS_COPY.columnWhen}
                  </th>
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                    {COLLECTIONS_COPY.columnAmount}
                  </th>
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                    {COLLECTIONS_COPY.columnCustomer}
                  </th>
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">
                    {COLLECTIONS_COPY.columnSource}
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                      {row.completedAt
                        ? new Date(row.completedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-sm font-medium">
                      {formatMoneyDisplay(row.amountCents / 100, row.currency)}
                    </td>
                    <td className="truncate py-2.5 pr-3 text-sm text-muted-foreground">
                      {row.customerEmail || "—"}
                    </td>
                    <td className="py-2.5 text-sm text-muted-foreground">
                      {row.source === "payment_link"
                        ? COLLECTIONS_COPY.sourcePaymentLink
                        : COLLECTIONS_COPY.sourceEmbed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
