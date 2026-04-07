"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import type { Transaction } from "@/lib/finance-types"
import { formatCurrency } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Copy, Check, Download, FileText, Activity } from "lucide-react"
import { downloadTransactionReceiptPdf } from "@/lib/use-transaction-receipt-pdf"
import { currentLocationPath, withReturnTo } from "@/lib/invoice-navigation"

interface TransactionDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  hideType?: boolean
}

export function TransactionDetailsDialog({
  open,
  onOpenChange,
  transaction,
  hideType = false,
}: TransactionDetailsDialogProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const txHere = currentLocationPath(pathname, searchParams)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)

  if (!transaction) return null

  const cardLast4 = transaction.cardLast4

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // ignore
    }
  }

  const handleDownloadReceipt = async () => {
    setDownloadingReceipt(true)
    try {
      await downloadTransactionReceiptPdf(transaction, cardLast4)
    } finally {
      setDownloadingReceipt(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Amount and Status */}
          <div className="flex items-center justify-between pb-4 border-b">
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              <p
                className={`text-2xl font-semibold ${transaction.direction === "credit" ? "text-green-600" : "text-foreground"}`}
              >
                {transaction.direction === "credit" ? "+" : "-"}
                {formatCurrency(Math.abs(transaction.amount), transaction.displayCurrency || "USD")}
              </p>
            </div>
            <Badge
              variant={
                transaction.status === "completed"
                  ? "default"
                  : transaction.status === "pending" || transaction.status === "processing"
                    ? "secondary"
                    : "destructive"
              }
              className="capitalize"
            >
              {transaction.status}
            </Badge>
          </div>

          {/* Transaction Details Grid */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Merchant</span>
              <span className="font-medium">{transaction.description}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Transaction ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{transaction.id}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleCopy(transaction.id, "transactionId")}
                >
                  {copiedKey === "transactionId" ? (
                    <Check className="h-3 w-3 text-primary" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>

            {transaction.reference && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Reference</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{transaction.reference}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleCopy(transaction.reference!, "reference")}
                  >
                    {copiedKey === "reference" ? (
                      <Check className="h-3 w-3 text-primary" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {!hideType && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{transaction.type.toUpperCase()}</span>
              </div>
            )}

            {cardLast4 ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Card</span>
                <span className="font-medium">•••• {cardLast4}</span>
              </div>
            ) : transaction.category ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Category</span>
                <span className="font-medium">{transaction.category}</span>
              </div>
            ) : null}

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">
                {new Date(transaction.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {transaction.fee !== undefined && transaction.fee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fee</span>
                <span className="font-medium">
                  {formatCurrency(transaction.fee, transaction.displayCurrency || "USD")}
                </span>
              </div>
            )}
          </div>

          {transaction.collectionChannel === "autopayout" && transaction.autopayoutConfigId ?
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm">
              <p className="font-medium text-foreground">QR Pay</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Collected via an in-person placard linked to your QR Pay configuration.
              </p>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                Config: {transaction.autopayoutConfigId}
              </p>
              <Button variant="link" className="h-auto px-0 pt-2 text-primary" asChild>
                <Link href="/qr-pay">Open QR Pay</Link>
              </Button>
            </div>
          : null}

          {/* Contextual Links */}
          <div className="pt-4 border-t space-y-2">
            {transaction.invoiceId && (
              <Button variant="outline" className="w-full gap-2 bg-transparent" asChild>
                <Link href={withReturnTo(`/invoices/${transaction.invoiceId}`, txHere)}>
                  <FileText className="h-4 w-4" />
                  View invoice
                </Link>
              </Button>
            )}
            {(transaction.transferId || transaction.id.startsWith("ETID")) &&
              (transaction.status === "pending" || transaction.status === "processing") && (
                <Button variant="outline" className="w-full gap-2 bg-transparent" asChild>
                  <Link href={`/send/status?id=${transaction.transferId ?? transaction.id}`}>
                    <Activity className="h-4 w-4" />
                    Track status
                  </Link>
                </Button>
              )}
            {transaction.status === "completed" && (
              <Button
                variant="outline"
                className="w-full gap-2 bg-transparent"
                onClick={handleDownloadReceipt}
                disabled={downloadingReceipt}
              >
                <Download className="h-4 w-4" />
                {downloadingReceipt ? "Downloading..." : "Download Receipt"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
