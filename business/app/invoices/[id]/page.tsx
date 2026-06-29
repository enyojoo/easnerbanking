"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Copy,
  Check,
  Download,
  Loader2,
  Mail,
  MoreHorizontal,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  FileText,
} from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import Link from "next/link"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getInvoiceDiscountAmount } from "@/lib/b2b/invoice-totals"
import { useInvoiceDetail } from "@/hooks/queries/use-invoices"
import { useAddInvoice, useUpdateInvoice, useDeleteInvoice } from "@/hooks/mutations/use-invoices"
import { formatInvoiceNumberFromClientId, generateInvoiceId } from "@/lib/invoice-id"
import { InvoiceStatusBadge } from "@/components/invoice-status-badge"
import { InvoicePaymentOptions } from "@/components/invoice-payment-options"
import { MarkAsPaidDialog } from "@/components/mark-as-paid-dialog"
import { downloadInvoicePdf } from "@/lib/use-invoice-pdf"
import { downloadInvoiceReceiptPdf } from "@/lib/use-invoice-receipt-pdf"
import { getPaymentRecordDisplay } from "@/lib/deposits"
import type { Invoice } from "@/lib/b2b/types"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useInvoicePayIn } from "@/hooks/use-invoice-pay-in"
import { useTransactionsCached } from "@/hooks/use-transactions-cached"
import { issuerFromBusinessProfile } from "@/lib/invoices/issuer"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  TIER2_COMPLETE_PLACEHOLDER,
  canProvisionInvoiceDepositInstructions,
} from "@/lib/compliance-placeholders"
import { currentLocationPath, invoiceBackHref, withReturnTo } from "@/lib/invoice-navigation"
import { invoicePublicViewPath } from "@/lib/invoice-public-url"
import { resolvePaymentDisplay } from "@/lib/invoices/resolve-payment-display"
import { filterPayInByDisplay } from "@/lib/invoices/filter-pay-in-by-display"
import {
  showInvoicePaymentPreview,
} from "@/lib/invoices/invoice-edit-lock"
import { invoiceActionBtnClass } from "@/lib/invoices/invoice-action-button-classes"
const STATUS_ACTIVITY_DESCRIPTIONS: Record<string, string> = {
  sent: "Invoice was sent to customer",
  paid: "Invoice was marked as paid",
  open: "Invoice was marked as unpaid",
  void: "Invoice was voided",
  past_due: "Invoice was marked past due",
  uncollectible: "Invoice was marked uncollectible",
  draft: "Invoice was reverted to draft",
  failed: "Invoice was marked as failed",
}

function getInvoiceActivities(invoice: Invoice): { id: string; type: string; description: string; timestamp: string }[] {
  const activities: { id: string; type: string; description: string; timestamp: string }[] = []
  const createdTs = invoice.createdDate.includes("T") ? invoice.createdDate : `${invoice.createdDate}T00:00:00`
  activities.push({ id: "1", type: "created", description: "Invoice was created", timestamp: createdTs })
  // Use statusHistory for status-change activities (each change = new activity)
  const history = invoice.statusHistory ?? []
  if (history.length > 0) {
    history.forEach((entry, i) => {
      const description = STATUS_ACTIVITY_DESCRIPTIONS[entry.status] ?? `Invoice status changed to ${entry.status}`
      const type = entry.status === "void" ? "voided" : entry.status === "open" ? "unpaid" : entry.status
      activities.push({
        id: `status-${i}-${entry.timestamp}`,
        type,
        description,
        timestamp: entry.timestamp,
      })
    })
  } else {
    // Fallback for invoices without statusHistory (legacy)
    if (invoice.status === "sent") {
      activities.push({
        id: "3",
        type: "sent",
        description: "Invoice was sent to customer",
        timestamp: createdTs,
      })
    }
    if (invoice.status === "void") {
      activities.push({
        id: "4",
        type: "voided",
        description: "Invoice was voided",
        timestamp: createdTs,
      })
    }
    if (invoice.status === "paid") {
      activities.push({
        id: "5",
        type: "paid",
        description: "Invoice was paid",
        timestamp: createdTs,
      })
    }
  }
  // Add notes as activities
  ;(invoice.notes ?? []).forEach((note) => {
    activities.push({
      id: `note-${note.id}`,
      type: "note",
      description: note.text,
      timestamp: note.createdAt,
    })
  })
  return activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

const getActivityIcon = (type: string) => {
  const iconConfig = {
    voided: XCircle,
    sent: Mail,
    viewed: Eye,
    note: FileText,
    unpaid: XCircle,
    collection_off: AlertCircle,
    created: Clock,
    paid: CheckCircle,
  }
  return iconConfig[type as keyof typeof iconConfig] || Clock
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const backHref = invoiceBackHref(searchParams)
  const here = currentLocationPath(pathname, searchParams)
  const profile = useBusinessProfile()
  const { tier1Complete, easetag: orgEasetag, invoiceSettings } = profile
  const issuer = issuerFromBusinessProfile(profile)
  const rawParamId = params?.id
  const invoiceId =
    typeof rawParamId === "string" ? rawParamId : Array.isArray(rawParamId) ? rawParamId[0] ?? null : null
  const invoiceDetailQuery = useInvoiceDetail(invoiceId)
  const addInvoiceMut = useAddInvoice()
  const updateInvoiceMut = useUpdateInvoice()
  const deleteInvoiceMut = useDeleteInvoice()
  const { data: ledgerRows } = useTransactionsCached()
  const invoice = invoiceDetailQuery.data
  /** Avoid full-page spinner when list cache seeds detail via `placeholderData`. */
  const invoicesLoading = invoiceDetailQuery.isPending && !invoice

  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    void updateInvoiceMut.mutate({ id, updates })
  }

  const addInvoice = async (inv: Invoice) => {
    try {
      const res = await addInvoiceMut.mutateAsync(inv)
      return res.invoice ?? null
    } catch {
      return null
    }
  }
  const [showMoreActivities, setShowMoreActivities] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [customerViews, setCustomerViews] = useState<{ viewedAt: string }[]>([])
  const [addNoteOpen, setAddNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [markAsPaidOpen, setMarkAsPaidOpen] = useState(false)
  const [customerViewUrl, setCustomerViewUrl] = useState("")

  const canProvisionDepositInstructions = invoice
    ? canProvisionInvoiceDepositInstructions(invoice.currency, tier1Complete, TIER2_COMPLETE_PLACEHOLDER)
    : false

  const payInQueryEnabled = Boolean(
    invoice &&
      !invoice.archived &&
      showInvoicePaymentPreview(invoice.status, invoice.documentType) &&
      invoice.status !== "paid" &&
      invoice.status !== "void" &&
      canProvisionDepositInstructions,
  )

  const {
    bankAccount,
    stablecoinAccount,
    loading: payInLoading,
  } = useInvoicePayIn({
    currency: invoice?.currency ?? "USD",
    tier1Complete,
    enabled: payInQueryEnabled,
  })

  const filteredPayIn = useMemo(() => {
    if (!invoice) return {}
    const display = resolvePaymentDisplay({
      invoice,
      businessDefaults: invoiceSettings,
      payIn: { bankAccount, stablecoinAccount },
      payable: payInQueryEnabled,
    })
    return filterPayInByDisplay({ bankAccount, stablecoinAccount }, display)
  }, [invoice, invoiceSettings, bankAccount, stablecoinAccount, payInQueryEnabled])

  const paymentDefaultTab = useMemo(() => {
    if (!invoice) return "bank" as const
    return resolvePaymentDisplay({
      invoice,
      businessDefaults: invoiceSettings,
      payIn: { bankAccount, stablecoinAccount },
      payable: true,
    }).defaultTab
  }, [invoice, invoiceSettings, bankAccount, stablecoinAccount])

  const hasAnyPayIn = Boolean(filteredPayIn.bankAccount || filteredPayIn.stablecoinAccount)

  const sendInvoiceEmailConfirmed = async () => {
    if (!invoice) return
    setIsSendingEmail(true)
    try {
      const res = await fetchWithSession("/api/invoices/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send email")
      handleStatusChange("sent")
      toast.success(`Invoice sent to ${invoice.customerEmail}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email")
    } finally {
      setIsSendingEmail(false)
    }
  }

  const finalizeDraft = async (andEmail: boolean) => {
    if (!invoice) return
    if (andEmail) setIsSendingEmail(true)
    else setIsFinalizing(true)
    const now = new Date().toISOString()
    try {
      await updateInvoiceMut.mutateAsync({
        id: invoice.id,
        updates: {
          status: "open",
          finalizedDate: invoice.finalizedDate ?? now,
          statusHistory: [
            ...(invoice.statusHistory ?? []),
            { status: "open", timestamp: now },
          ],
        },
      })

      if (andEmail) {
        if (!invoice.customerEmail?.trim()) {
          throw new Error("Invoice has no customer email")
        }
        const res = await fetchWithSession("/api/invoices/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: invoice.id }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(data.error || "Failed to send email")
        await updateInvoiceMut.mutateAsync({
          id: invoice.id,
          updates: {
            status: "sent",
            statusHistory: [
              ...(invoice.statusHistory ?? []),
              { status: "open", timestamp: now },
              { status: "sent", timestamp: new Date().toISOString() },
            ],
          },
        })
        toast.success(`Invoice sent to ${invoice.customerEmail}`)
      } else {
        toast.success("Invoice finalized")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to finalize invoice")
    } finally {
      setIsSendingEmail(false)
      setIsFinalizing(false)
    }
  }

  const markAsSent = () => {
    if (!invoice) return
    handleStatusChange("sent")
    toast.success("Invoice marked as sent")
  }

  const publicViewHref =
    orgEasetag?.trim()
      ? invoicePublicViewPath(orgEasetag.trim(), invoice?.invoiceNumber ?? "")
      : invoice
        ? `/invoice-view/${invoice.id}`
        : ""

  const convertQuoteToInvoice = async () => {
    if (!invoice) return
    try {
      const res = await fetchWithSession(`/api/business/b2b/invoices/${invoice.id}/convert-to-invoice`, {
        method: "POST",
      })
      const data = (await res.json()) as { invoice?: Invoice; error?: string }
      if (!res.ok) throw new Error(data.error || "Convert failed")
      if (data.invoice) {
        toast.success("Quote converted to invoice")
        router.push(withReturnTo(`/invoices/${data.invoice.id}`, here))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not convert quote")
    }
  }

  useEffect(() => {
    if (!invoice?.id) return
    fetch(`/api/invoices/${invoice.id}/views`)
      .then((res) => res.json())
      .then((data) => setCustomerViews(data.views ?? []))
      .catch(() => {})
  }, [invoice?.id])

  const activities = useMemo(() => {
    if (!invoice) return []
    const base = getInvoiceActivities(invoice)
    const viewActivities = customerViews.map((v, i) => ({
      id: `view-${i}`,
      type: "viewed",
      description: "Invoice viewed by customer",
      timestamp: v.viewedAt,
    }))
    return [...base, ...viewActivities].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [invoice, customerViews])

  useEffect(() => {
    if (!invoice?.id || typeof window === "undefined") return
    const origin = window.location.origin
    if (orgEasetag?.trim()) {
      setCustomerViewUrl(`${origin}${invoicePublicViewPath(orgEasetag.trim(), invoice.invoiceNumber)}`)
    } else {
      setCustomerViewUrl(`${origin}/invoice-view/${invoice.id}`)
    }
  }, [invoice?.id, invoice?.invoiceNumber, orgEasetag])

  const handleStatusChange = (newStatus: Invoice["status"]) => {
    if (!invoice) return
    const entry = { status: newStatus, timestamp: new Date().toISOString() }
    void updateInvoice(invoice.id, {
      status: newStatus,
      statusHistory: [...(invoice.statusHistory ?? []), entry],
    })
  }

  const handleEdit = () => {
    if (!invoice) return
    router.push(withReturnTo(`/invoices/create?edit=${invoice.id}`, here))
  }

  const handleDuplicate = async () => {
    if (!invoice) return
    const newId = generateInvoiceId()
    const newInvoiceNumber = formatInvoiceNumberFromClientId(newId)
    const nowIso = new Date().toISOString()
    const duplicate: Invoice = {
      ...invoice,
      id: newId,
      invoiceNumber: newInvoiceNumber,
      status: "draft",
      createdDate: nowIso,
      finalizedDate: null,
      statusHistory: [],
      archived: false,
    }
    const created = await addInvoice(duplicate)
    if (created) {
      toast.success("Invoice duplicated")
      router.push(withReturnTo(`/invoices/create?edit=${created.id}`, here))
    } else {
      toast.error("Could not duplicate invoice")
    }
  }

  const handleArchive = () => {
    if (!invoice) return
    void updateInvoice(invoice.id, { archived: true })
    toast.success("Invoice archived")
    router.push(backHref)
  }

  const handleUnarchive = () => {
    if (!invoice) return
    void updateInvoice(invoice.id, { archived: false, status: "draft" })
    toast.success("Invoice restored")
  }

  const handleDelete = async () => {
    if (!invoice) return
    const id = invoice.id
    setDeleteDialogOpen(false)
    try {
      await deleteInvoiceMut.mutateAsync(id)
      toast.success("Invoice deleted")
      router.replace(backHref)
    } catch {
      toast.error("Could not delete invoice")
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

  const displayedActivities = showMoreActivities ? activities : activities.slice(0, 3)

  const formatDateWithTime = (dateString: string) => {
    return formatDate(dateString, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (invoicesLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="space-y-6">
        <Link href={backHref}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="py-12 text-center">
          <h2 className="text-lg font-semibold">Invoice not found</h2>
          <p className="text-sm text-muted-foreground mt-2">
            The invoice you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <Link href={backHref}>
            <Button className="mt-4">Go back</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={backHref}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{invoice.invoiceNumber}</h1>
            <InvoiceStatusBadge status={invoice.archived ? "archived" : invoice.status} />
            {!invoice.archived && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
                    Change status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => setMarkAsPaidOpen(true)}
                    disabled={invoice.status === "paid"}
                  >
                    Mark as Paid
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusChange("open")}
                    disabled={invoice.status === "open"}
                  >
                    Mark as Unpaid
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusChange("sent")}
                    disabled={invoice.status === "sent"}
                  >
                    Mark as Sent
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusChange("past_due")}
                    disabled={invoice.status === "past_due"}
                  >
                    Mark Past Due
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusChange("void")}
                    disabled={invoice.status === "void"}
                  >
                    Mark as Void
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Billed to {invoice.customerName} - {formatCurrency(invoice.total, invoice.currency)}
            {invoice.poNumber?.trim() ? (
              <span className="block text-sm mt-0.5">PO / Ref: {invoice.poNumber}</span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!invoice.archived && invoice.status === "draft" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className={invoiceActionBtnClass.finalize}
                disabled={isFinalizing || isSendingEmail}
                onClick={() => void finalizeDraft(false)}
              >
                {isFinalizing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Finalizing…
                  </>
                ) : (
                  "Finalize invoice"
                )}
              </Button>
              {invoice.customerEmail?.trim() ? (
                <Button
                  size="sm"
                  className={invoiceActionBtnClass.email}
                  disabled={isFinalizing || isSendingEmail}
                  onClick={() => void finalizeDraft(true)}
                >
                  {isSendingEmail ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Finalize and email
                    </>
                  )}
                </Button>
              ) : null}
            </>
          )}
          {!invoice.archived &&
            invoice.status === "open" &&
            invoice.customerEmail?.trim() && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className={invoiceActionBtnClass.markSent}
                  onClick={markAsSent}
                  disabled={isSendingEmail}
                >
                  Mark as sent
                </Button>
                <Button
                  size="sm"
                  className={invoiceActionBtnClass.email}
                  onClick={() => void sendInvoiceEmailConfirmed()}
                  disabled={isSendingEmail}
                >
                  {isSendingEmail ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Email invoice
                    </>
                  )}
                </Button>
              </>
            )}
          {!invoice.archived &&
            (invoice.status === "sent" || invoice.status === "past_due") &&
            invoice.customerEmail?.trim() && (
              <Button
                variant="outline"
                size="sm"
                className={invoiceActionBtnClass.email}
                onClick={() => void sendInvoiceEmailConfirmed()}
                disabled={isSendingEmail}
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Resend email
                  </>
                )}
              </Button>
            )}
          {!invoice.archived && invoice.status !== "draft" && (
            <Button
              variant="outline"
              size="icon"
              className={invoiceActionBtnClass.downloadIcon}
              aria-label={isDownloading ? "Downloading invoice" : "Download invoice"}
              onClick={async () => {
                if (!invoice) return
                setIsDownloading(true)
                try {
                  await downloadInvoicePdf(
                    invoice,
                    canProvisionDepositInstructions ? bankAccount : undefined,
                    canProvisionDepositInstructions ? stablecoinAccount : undefined,
                    issuer,
                    { publicEasetag: orgEasetag ?? undefined },
                  )
                } catch (err) {
                  console.error("Failed to download PDF:", err)
                } finally {
                  setIsDownloading(false)
                }
              }}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(invoice.status === "quote" || invoice.documentType === "quote") && (
                <DropdownMenuItem onClick={() => void convertQuoteToInvoice()}>
                  Convert to invoice
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleEdit}>
                Edit invoice
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={invoice.archived ? handleUnarchive : handleArchive}>
                {invoice.archived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice content: Business info | Bill to, line items, total, payment options */}
          <Card>
            <CardContent className="p-4 sm:p-6 lg:p-8">
              {/* Business info | Bill to */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-6 sm:mb-8">
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-semibold">{issuer.name}</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">{issuer.address}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {issuer.city}, {issuer.state} {issuer.zipCode}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">{issuer.country}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-2">{issuer.email}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">{issuer.phone}</p>
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold mb-2 text-sm text-muted-foreground uppercase tracking-wide">Bill to</h3>
                  {invoice.billToType === "company" && invoice.customerCompany ? (
                    <>
                      <p className="font-medium">{invoice.customerCompany}</p>
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
                      <p className="font-medium">{invoice.customerName}</p>
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
              </div>

              {/* Line items - card layout on mobile, table on desktop */}
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
                        <p className="font-medium text-sm">{item.description}</p>
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
                        <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Description</th>
                        <th className="text-right p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Qty</th>
                        <th className="text-right p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Unit Price</th>
                        <th className="text-right p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Amount</th>
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

              {/* Total */}
              {invoice.memo?.trim() && (
                <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Memo</p>
                  <p className="text-sm whitespace-pre-wrap">{invoice.memo}</p>
                </div>
              )}

              <div className="flex justify-end">
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
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="text-xl sm:text-2xl font-bold">
                      {formatCurrency(invoice.total, invoice.currency)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Invoice payment options — only when deposit instructions are provisioned for this currency/tier */}
          {!invoice.archived &&
            showInvoicePaymentPreview(invoice.status, invoice.documentType) &&
            invoice.status !== "paid" &&
            payInQueryEnabled &&
            (payInLoading ? (
              <Card className="border-dashed bg-muted/20">
                <CardContent className="py-8 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : hasAnyPayIn ? (
              <InvoicePaymentOptions
                invoice={invoice}
                bankAccount={filteredPayIn.bankAccount}
                stablecoinAccount={filteredPayIn.stablecoinAccount}
                businessDisplayName={issuer.name}
                audience="business"
                publicInvoiceEasetag={orgEasetag}
                defaultTab={paymentDefaultTab}
              />
            ) : canProvisionDepositInstructions ? (
              <Card className="border-dashed bg-muted/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Customer payment instructions</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>No virtual account or wallet is available for this currency yet. Open an account or complete setup in Accounts.</p>
                </CardContent>
              </Card>
            ) : null)}
          {!invoice.archived &&
            showInvoicePaymentPreview(invoice.status, invoice.documentType) &&
            invoice.status !== "paid" &&
            !payInQueryEnabled &&
            (canProvisionDepositInstructions ? null : (
              <Card className="border-dashed bg-muted/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Customer payment instructions</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Bank and stablecoin deposit details for this invoice are not provisioned yet. Complete the
                    verification steps required for your organization so pay-in instructions can appear here and on PDFs.
                  </p>
                  <p>
                    <Link href="/settings?tab=business" className="font-semibold text-primary underline underline-offset-2">
                      Business verification
                    </Link>
                  </p>
                </CardContent>
              </Card>
            ))}

          {/* Invoice receipt - when paid */}
          {!invoice.archived && invoice.status === "paid" && (() => {
            const paymentRecord = getPaymentRecordDisplay(invoice, ledgerRows)
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
                  className={invoiceActionBtnClass.downloadReceipt}
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
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download Receipt
                    </>
                  )}
                </Button>
              </div>
            )
          })()}

        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Invoice details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Due date</span>
                <span className="text-sm">{formatDate(invoice.dueDate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Created</span>
                <span className="text-sm">{formatDate(invoice.createdDate)}</span>
              </div>
              {!invoice.archived && publicViewHref && (
                <div className="space-y-1 pt-2 border-t">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {invoice.status === "draft" ? "Customer view" : "Invoice link"}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(customerViewUrl, "invoice-link")}
                      >
                        {copiedField === "invoice-link" ? (
                          <Check className="h-3 w-3 text-primary" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                      <Link href={publicViewHref} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                  {invoice.status === "draft" ? (
                    <p className="text-xs text-muted-foreground">
                      Preview how your customer will see this invoice after you finalize or send it.
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent activity</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNoteText("")
                    setAddNoteOpen(true)
                  }}
                >
                  Add note
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {displayedActivities.map((activity) => {
                  const IconComponent = getActivityIcon(activity.type)
                  return (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <IconComponent className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateWithTime(activity.timestamp)}
                        </p>
                      </div>
                    </div>
                  )
                })}
                {activities.length > 3 && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowMoreActivities(!showMoreActivities)}
                  >
                    {showMoreActivities ? "Show less" : "Show more"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete invoice {invoice.invoiceNumber}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark as Paid dialog */}
      {invoice && (
        <MarkAsPaidDialog
          invoice={invoice}
          open={markAsPaidOpen}
          onOpenChange={setMarkAsPaidOpen}
          onSuccess={(paymentInfo) => {
            const entry = {
              status: "paid" as const,
              timestamp: paymentInfo.paidAt,
            }
            updateInvoice(invoice.id, {
              status: "paid",
              paymentInfo,
              statusHistory: [...(invoice.statusHistory ?? []), entry],
            })
            toast.success("Invoice marked as paid")
          }}
        />
      )}

      {/* Add note dialog */}
      <Dialog open={addNoteOpen} onOpenChange={setAddNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add internal note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Internal note (team only, not sent to customer)
            </p>
            <Textarea
              placeholder="Add an internal note for your team…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!noteText.trim() || !invoice) return
                const newNote = {
                  id: `note-${Date.now()}`,
                  text: noteText.trim(),
                  createdAt: new Date().toISOString(),
                }
                updateInvoice(invoice.id, {
                  notes: [...(invoice.notes ?? []), newNote],
                })
                toast.success("Note added")
                setAddNoteOpen(false)
                setNoteText("")
              }}
              disabled={!noteText.trim()}
            >
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
