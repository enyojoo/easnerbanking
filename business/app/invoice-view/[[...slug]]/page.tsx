"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Copy, Download, Loader2 } from "lucide-react"
import { businessInfo } from "@/lib/business-info"
import type { Invoice } from "@/lib/b2b/types"
import { formatDate, formatCurrency } from "@/lib/utils"
import { getInvoiceDiscountAmount } from "@/lib/b2b/invoice-totals"
import { invoicePublicViewPath } from "@/lib/invoice-public-url"
import { InvoiceStatusBadge } from "@/components/invoice-status-badge"
import { InvoicePaymentOptions } from "@/components/invoice-payment-options"
import { downloadInvoicePdf } from "@/lib/use-invoice-pdf"
import { downloadInvoiceReceiptPdf } from "@/lib/use-invoice-receipt-pdf"
import { getPaymentRecordDisplay } from "@/lib/deposits"
import { BRAND } from "@/components/brand/brand-constants"
import { LoadingSpinner } from "@/components/loading-spinner"
import type { InvoicePdfIssuer } from "@/lib/invoices/issuer"
import type { InvoicePayInPayload } from "@/lib/invoices/resolve-pay-in-for-business"

const FALLBACK_ISSUER: InvoicePdfIssuer = {
  name: businessInfo.name,
  address: businessInfo.address,
  city: businessInfo.city,
  state: businessInfo.state,
  zipCode: businessInfo.zipCode,
  country: businessInfo.country,
  email: businessInfo.email,
  phone: businessInfo.phone,
}

export default function InvoiceViewPage() {
  const params = useParams()
  const parts = useMemo(() => {
    const raw = params.slug
    if (raw == null) return [] as string[]
    return Array.isArray(raw) ? raw : [String(raw)]
  }, [params.slug])

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [publicEasetag, setPublicEasetag] = useState<string | null>(null)
  const [issuer, setIssuer] = useState<InvoicePdfIssuer | null>(null)
  const [payIn, setPayIn] = useState<InvoicePayInPayload>({})
  const [loadState, setLoadState] = useState<"loading" | "error" | "ok">("loading")
  const [paymentTab, setPaymentTab] = useState<"bank" | "stablecoin">("bank")
  const [isDownloading, setIsDownloading] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadState("loading")
    setInvoice(null)
    setPublicEasetag(null)
    setIssuer(null)
    setPayIn({})

    if (parts.length !== 1 && parts.length !== 2) {
      setLoadState("error")
      return
    }

    const url =
      parts.length === 1
        ? `/api/invoices/public/by-id/${encodeURIComponent(parts[0])}`
        : `/api/invoices/public/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`

    fetch(url)
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as {
          invoice?: Invoice
          issuer?: InvoicePdfIssuer
          payIn?: InvoicePayInPayload
          businessEasetag?: string | null
        }
        if (cancelled) return
        if (!r.ok || !data.invoice) {
          setLoadState("error")
          return
        }
        setInvoice(data.invoice)
        setPublicEasetag(
          typeof data.businessEasetag === "string" && data.businessEasetag.trim()
            ? data.businessEasetag.trim()
            : null,
        )
        setIssuer(data.issuer ?? null)
        const pi = data.payIn ?? {}
        setPayIn(pi)
        setPaymentTab(pi.bankAccount ? "bank" : "stablecoin")
        setLoadState("ok")
      })
      .catch(() => {
        if (!cancelled) setLoadState("error")
      })
    return () => {
      cancelled = true
    }
  }, [parts])

  const displayIssuer = issuer ?? FALLBACK_ISSUER

  useEffect(() => {
    if (invoice?.id) {
      fetch(`/api/invoices/${invoice.id}/record-view`, { method: "POST" }).catch(() => {})
    }
  }, [invoice?.id])

  const publicViewUrl = useMemo(() => {
    if (typeof window === "undefined" || !invoice) return ""
    const origin = window.location.origin
    if (publicEasetag) {
      return `${origin}${invoicePublicViewPath(publicEasetag, invoice.invoiceNumber)}`
    }
    return `${origin}/invoice-view/${invoice.id}`
  }, [invoice, publicEasetag])

  const handleCopyLink = async () => {
    if (typeof window === "undefined" || !invoice || !publicViewUrl) return
    try {
      await navigator.clipboard.writeText(publicViewUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch (err) {
      console.error("Failed to copy link:", err)
    }
  }

  const copyToClipboard = async (text: string, field?: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textArea = document.createElement("textarea")
        textArea.value = text
        textArea.style.position = "fixed"
        textArea.style.left = "-9999px"
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand("copy")
        document.body.removeChild(textArea)
      }
      if (field) {
        setCopiedField(field)
        setTimeout(() => setCopiedField(null), 2000)
      }
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  if (loadState === "loading") {
    return <LoadingSpinner />
  }

  if (loadState === "error" || !invoice) {
    return (
      <div className="w-full max-w-2xl text-center">
        <Card>
          <CardContent className="py-12">
            <h2 className="text-lg font-semibold">Invoice not found</h2>
            <p className="text-sm text-muted-foreground mt-2">
              This invoice may have been removed or the link is incorrect.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const bankAccount = payIn.bankAccount
  const stablecoinAccount = payIn.stablecoinAccount
  const hasPayInRail = Boolean(bankAccount || stablecoinAccount)
  const showPayCard =
    (invoice.status === "open" || invoice.status === "sent" || invoice.status === "past_due") &&
    hasPayInRail
  const showReceiptCard = invoice.status === "paid"

  const handleDownloadPdf = async () => {
    if (!invoice) return
    setIsDownloading(true)
    try {
      await downloadInvoicePdf(invoice, bankAccount, stablecoinAccount, displayIssuer)
    } catch (err) {
      console.error("Failed to download PDF:", err)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <Card className="print:shadow-none print:border">
        <CardContent className="p-4 pt-1 pb-0.5 sm:p-6 sm:pt-2 sm:pb-1 lg:p-8 lg:pt-3 lg:pb-2">
          <div className="flex justify-between items-center mb-6 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="text-xs sm:text-sm h-8 sm:h-9 px-2.5 sm:px-3"
            >
              {copiedLink ? (
                <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
              )}
              {copiedLink ? "Copied" : "Copy Link"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="text-xs sm:text-sm h-8 sm:h-9 px-2.5 sm:px-3"
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
              )}
              Download PDF
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold">{displayIssuer.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">{displayIssuer.address}</p>
              <p className="text-sm text-muted-foreground">
                {displayIssuer.city}, {displayIssuer.state} {displayIssuer.zipCode}
              </p>
              <p className="text-sm text-muted-foreground">{displayIssuer.country}</p>
              <p className="text-sm text-muted-foreground mt-2">{displayIssuer.email}</p>
              <p className="text-sm text-muted-foreground">{displayIssuer.phone}</p>
            </div>
            <div className="text-right min-w-0">
              <h1 className="text-base sm:text-2xl font-bold">Invoice</h1>
              <p className="text-sm text-muted-foreground mt-1">{invoice.invoiceNumber}</p>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-6 sm:mb-8">
            <div className="text-left">
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Bill to</h3>
              {invoice.billToType === "company" && invoice.customerCompany ? (
                <>
                  <p className="text-sm font-medium">{invoice.customerCompany}</p>
                  <p className="text-sm text-muted-foreground">{invoice.customerEmail}</p>
                  {invoice.customerAddress && (
                    <p className="text-sm text-muted-foreground">{invoice.customerAddress}</p>
                  )}
                  {invoice.customerPhone && (
                    <p className="text-sm text-muted-foreground">{invoice.customerPhone}</p>
                  )}
                  {invoice.customerName && (
                    <p className="text-sm text-muted-foreground mt-1">Attn: {invoice.customerName}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">{invoice.customerName}</p>
                  <p className="text-sm text-muted-foreground">{invoice.customerEmail}</p>
                  {invoice.customerAddress && (
                    <p className="text-sm text-muted-foreground">{invoice.customerAddress}</p>
                  )}
                  {invoice.customerPhone && (
                    <p className="text-sm text-muted-foreground">{invoice.customerPhone}</p>
                  )}
                </>
              )}
            </div>
            <div />
            <div className="text-left">
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Invoice details</h3>
              <p className="text-sm">
                <span className="text-muted-foreground">Due date:</span> {formatDate(invoice.dueDate)}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Created:</span> {formatDate(invoice.createdDate)}
              </p>
            </div>
          </div>

          {invoice.memo?.trim() && (
            <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Memo</p>
              <p className="text-sm whitespace-pre-wrap">{invoice.memo}</p>
            </div>
          )}

          <div className="mb-6">
            <div className="sm:hidden border rounded-lg overflow-hidden">
              <div className="flex justify-between items-center px-3 py-2.5 bg-muted text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <span>Description</span>
                <span>Amount</span>
              </div>
              {invoice.lineItems.map((item, i) => (
                <div
                  key={i}
                  className="flex justify-between items-start gap-3 px-3 py-3 border-t bg-muted/20"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.quantity} × {formatCurrency(item.unitPrice, invoice.currency)}
                    </p>
                  </div>
                  <span className="text-sm font-medium flex-shrink-0">
                    {formatCurrency(item.amount, invoice.currency)}
                  </span>
                </div>
              ))}
            </div>
            <div className="hidden sm:block border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Qty</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Unit Price</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-3 text-sm">{item.description}</td>
                      <td className="p-3 text-right text-sm">{item.quantity}</td>
                      <td className="p-3 text-right text-sm">
                        {formatCurrency(item.unitPrice, invoice.currency)}
                      </td>
                      <td className="p-3 text-right text-sm font-medium">
                        {formatCurrency(item.amount, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end mb-6">
            <div className="text-right space-y-1">
              {invoice.subtotal != null &&
                ((invoice.tax ?? 0) > 0 ||
                  (invoice.taxRate ?? 0) > 0 ||
                  getInvoiceDiscountAmount(invoice) > 0) && (
                <>
                  <div className="flex justify-between gap-8 text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                  </div>
                  {getInvoiceDiscountAmount(invoice) > 0 && (
                    <div className="flex justify-between gap-8 text-sm">
                      <span className="text-muted-foreground">
                        Discount
                        {invoice.discountRate != null && invoice.discountRate > 0
                          ? ` (${invoice.discountRate}%)`
                          : ""}
                      </span>
                      <span>
                        −{formatCurrency(getInvoiceDiscountAmount(invoice), invoice.currency)}
                      </span>
                    </div>
                  )}
                  {((invoice.tax ?? 0) > 0 || (invoice.taxRate ?? 0) > 0) && (
                    <div className="flex justify-between gap-8 text-sm">
                      <span className="text-muted-foreground">
                        Tax{invoice.taxRate != null && invoice.taxRate > 0 ? ` (${invoice.taxRate}%)` : ""}
                      </span>
                      <span>{formatCurrency(invoice.tax ?? 0, invoice.currency)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between gap-8 items-baseline pt-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Total</span>
                <span className="text-lg sm:text-2xl font-bold">
                  {formatCurrency(invoice.total, invoice.currency)}
                </span>
              </div>
            </div>
          </div>

          {showPayCard && (bankAccount || stablecoinAccount) && (
            <InvoicePaymentOptions
              invoice={invoice}
              bankAccount={bankAccount}
              stablecoinAccount={stablecoinAccount}
              businessDisplayName={displayIssuer.name}
              embedded
              audience="customer"
              value={paymentTab}
              onValueChange={setPaymentTab}
              publicInvoiceEasetag={publicEasetag}
            />
          )}

          {showReceiptCard &&
            (() => {
              const paymentRecord = getPaymentRecordDisplay(invoice)
              return (
                <div className="rounded-lg border bg-muted/30 p-4 sm:p-6 space-y-4">
                  <h3 className="text-sm font-semibold">Invoice Receipt</h3>
                  {paymentRecord && (
                    <div className="rounded-lg border bg-background p-4 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Payment record
                      </p>
                      {paymentRecord.method === "easner" ? (
                        <div className="space-y-2 text-sm">
                          {paymentRecord.paymentMethod && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Method</span>
                              <span>{paymentRecord.paymentMethod}</span>
                            </div>
                          )}
                          {paymentRecord.amount != null && paymentRecord.currency && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Amount</span>
                              <span>{formatCurrency(paymentRecord.amount, paymentRecord.currency)}</span>
                            </div>
                          )}
                          {paymentRecord.date && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Date</span>
                              <span>{formatDate(paymentRecord.date)}</span>
                            </div>
                          )}
                          {paymentRecord.reference && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Reference</span>
                              <span>{paymentRecord.reference}</span>
                            </div>
                          )}
                          {paymentRecord.transactionId && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Transaction ID</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs">{paymentRecord.transactionId}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => copyToClipboard(paymentRecord.transactionId!, "payment-txn-id")}
                                >
                                  {copiedField === "payment-txn-id" ? (
                                    <Check className="h-3 w-3 text-primary" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm">
                          <p className="text-muted-foreground">Payment received by cash or other method</p>
                          {paymentRecord.cashNote && (
                            <p className="mt-2 p-2 rounded bg-muted/50 text-sm">{paymentRecord.cashNote}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!invoice) return
                      setIsDownloading(true)
                      try {
                        await downloadInvoiceReceiptPdf(invoice)
                      } catch (err) {
                        console.error("Failed to download receipt:", err)
                      } finally {
                        setIsDownloading(false)
                      }
                    }}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    )}
                    Download Receipt
                  </Button>
                </div>
              )
            })()}

          <div className="flex items-center justify-center gap-1.5 mt-8 pt-6 pb-0 border-t text-xs text-muted-foreground">
            <span>Powered by</span>
            <a
              href="https://www.easner.com/business"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center"
            >
              <img
                src={BRAND.logoBusiness}
                alt="Easner Business"
                className="h-5 sm:h-6 w-auto object-contain"
              />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
