"use client"

import { useIsRestoring } from "@tanstack/react-query"
import { formatMoneyDisplay } from "@easner/shared"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CheckoutTestPaymentsSkeleton } from "@/components/collections/collections-skeletons"
import { useCheckoutTestPaymentsQuery } from "@/hooks/queries/use-checkout-test-payments-query"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"

export function CheckoutTestPaymentsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isRestoring = useIsRestoring()
  const query = useCheckoutTestPaymentsQuery(open)
  const payments = query.data?.payments ?? []
  const loading = !query.data && (isRestoring || query.isFetching)
  const error =
    query.error instanceof Error ? query.error.message : query.error ? COLLECTIONS_COPY.testPaymentsLoadError : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{COLLECTIONS_COPY.testPaymentsTitle}</DialogTitle>
          <DialogDescription>{COLLECTIONS_COPY.testPaymentsBlurb}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <CheckoutTestPaymentsSkeleton />
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
