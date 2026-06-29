"use client"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getInvoiceDiscountAmount } from "@/lib/b2b/invoice-totals"
import type { Invoice } from "@/lib/b2b/types"
import type { InvoicePdfIssuer } from "@/lib/invoices/issuer"
import type { InvoicePayInPayload } from "@/lib/invoices/resolve-pay-in-for-business"
import { InvoicePaymentOptions } from "@/components/invoice-payment-options"
import { InvoiceStatusBadge } from "@/components/invoice-status-badge"

type InvoicePreviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Invoice
  issuer?: InvoicePdfIssuer
  payIn?: InvoicePayInPayload
  defaultTab?: "bank" | "stablecoin"
  /** Primary confirm action label */
  confirmLabel?: string
  onConfirm?: () => void | Promise<void>
  confirming?: boolean
  /** When true, hide confirm (view-only preview) */
  viewOnly?: boolean
}

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  invoice,
  issuer,
  payIn = {},
  defaultTab,
  confirmLabel = "Confirm",
  onConfirm,
  confirming = false,
  viewOnly = false,
}: InvoicePreviewDialogProps) {
  const discount = getInvoiceDiscountAmount(invoice)
  const showPayment =
    invoice.status !== "draft" &&
    invoice.status !== "quote" &&
    invoice.documentType !== "quote"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 border rounded-lg p-6 bg-background">
          <div className="flex justify-between gap-4">
            <div>
              <p className="font-semibold text-lg">{issuer?.name || "Business"}</p>
              {issuer?.email ? (
                <p className="text-sm text-muted-foreground">{issuer.email}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="font-semibold">Invoice</p>
              <p className="text-sm text-muted-foreground">{invoice.invoiceNumber}</p>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Bill to</p>
              <p className="font-medium">{invoice.customerName}</p>
              <p className="text-muted-foreground">{invoice.customerEmail}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">Due {formatDate(invoice.dueDate)}</p>
              {invoice.poNumber ? (
                <p className="text-muted-foreground">PO: {invoice.poNumber}</p>
              ) : null}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2">Description</th>
                <th className="text-right py-2">Qty</th>
                <th className="text-right py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((item, i) => (
                <tr key={i} className="border-b border-muted/50">
                  <td className="py-2">{item.description}</td>
                  <td className="text-right py-2">{item.quantity}</td>
                  <td className="text-right py-2">
                    {formatCurrency(item.amount, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-col items-end gap-1 text-sm">
            {discount > 0 ? (
              <div className="flex gap-8">
                <span className="text-muted-foreground">Discount</span>
                <span>−{formatCurrency(discount, invoice.currency)}</span>
              </div>
            ) : null}
            <div className="flex gap-8 font-semibold text-base">
              <span>Total</span>
              <span>{formatCurrency(invoice.total, invoice.currency)}</span>
            </div>
          </div>

          {invoice.memo ? (
            <div className="text-sm border-t pt-4">
              <p className="text-muted-foreground mb-1">Message</p>
              <p>{invoice.memo}</p>
            </div>
          ) : null}

          {showPayment ? (
            <InvoicePaymentOptions
              invoice={invoice}
              bankAccount={payIn.bankAccount}
              stablecoinAccount={payIn.stablecoinAccount}
              embedded
              audience="customer"
              defaultTab={defaultTab}
            />
          ) : null}
        </div>

        {!viewOnly ? (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
              Go back
            </Button>
            {onConfirm ? (
              <Button onClick={() => void onConfirm()} disabled={confirming}>
                {confirming ? "Working…" : confirmLabel}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
