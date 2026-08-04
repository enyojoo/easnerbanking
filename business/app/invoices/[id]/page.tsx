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
import {
  INVOICE_ACTION_COPY,
  INVOICE_ACTIVITY_COPY,
  INVOICE_SHARE_COPY,
  INVOICE_TOAST_COPY,
  PAGE_COPY,
} from "@/lib/copy/business-ui-copy"
import { InvoiceShareMenu } from "@/components/invoice/invoice-share-menu"
import { getInvoiceDiscountAmount } from "@/lib/b2b/invoice-totals"
import { useInvoiceDetail } from "@/hooks/queries/use-invoices"
import { useAddInvoice, useUpdateInvoice, useDeleteInvoice } from "@/hooks/mutations/use-invoices"
import { formatInvoiceNumberFromClientId, generateInvoiceId } from "@/lib/invoice-id"
import { InvoiceStatusBadge } from "@/components/invoice-status-badge"
import { MarkAsPaidDialog } from "@/components/mark-as-paid-dialog"
import { downloadInvoicePdf } from "@/lib/use-invoice-pdf"
import {
  buildInvoicePdfPaymentSection,
  paymentFlagsFromDisplay,
} from "@/lib/invoices/invoice-payment-copy"
import { downloadInvoiceReceiptPdf } from "@/lib/use-invoice-receipt-pdf"
import { getPaymentRecordDisplay } from "@/lib/deposits"
import type { Invoice } from "@/lib/b2b/types"
import type { InvoiceManualStatusAction } from "@/lib/invoices/invoice-status"
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
import {
  buildInvoiceCustomerViewPath,
  buildInvoiceCustomerViewUrl,
  buildInvoicePreviewUrl,
  invoicePreviewPath,
} from "@/lib/invoice-public-url"
import { resolvePaymentDisplay } from "@/lib/invoices/resolve-payment-display"
import {
  invoiceFieldsLockBanner,
  showInvoicePaymentPreview,
} from "@/lib/invoices/invoice-edit-lock"
import {
  customerLinkHint,
  draftPreviewHint,
  getInvoiceManualStatusActions,
  invoiceStatusHelper,
  invoiceStatusNextAction,
  isInvoiceCustomerLinkShareable,
  isInvoiceDraft,
  manualStatusChangeToast,
  previewLinkHint,
} from "@/lib/invoices/invoice-status"
import { invoiceActionBtnClass } from "@/lib/invoices/invoice-action-button-classes"
const STATUS_ACTIVITY_DESCRIPTIONS: Record<string, string> = {
  sent: INVOICE_ACTIVITY_COPY.sent,
  paid: INVOICE_ACTIVITY_COPY.paid,
  unpaid: INVOICE_ACTIVITY_COPY.issued,
  void: INVOICE_ACTIVITY_COPY.void,
  past_due: INVOICE_ACTIVITY_COPY.past_due,
  draft: INVOICE_ACTIVITY_COPY.draft,
}

function getInvoiceActivities(invoice: Invoice): { id: string; type: string; description: string; timestamp: string }[] {
  const activities: { id: string; type: string; description: string; timestamp: string }[] = []
  const createdTs = invoice.createdDate.includes("T") ? invoice.createdDate : `${invoice.createdDate}T00:00:00`
  activities.push({
    id: "1",
    type: "created",
    description: INVOICE_ACTIVITY_COPY.created,
    timestamp: createdTs,
  })
  const history = invoice.statusHistory ?? []
  if (history.length > 0) {
    history.forEach((entry, i) => {
      const description =
        STATUS_ACTIVITY_DESCRIPTIONS[entry.status] ?? `Invoice status changed to ${entry.status}`
      const type = entry.status === "void" ? "voided" : entry.status
      activities.push({
        id: `status-${i}-${entry.timestamp}`,
        type,
        description,
        timestamp: entry.timestamp,
      })
    })
  } else {
    if (invoice.status === "sent") {
      activities.push({
        id: "3",
        type: "sent",
        description: INVOICE_ACTIVITY_COPY.sent,
        timestamp: createdTs,
      })
    }
    if (invoice.status === "void") {
      activities.push({
        id: "4",
        type: "voided",
        description: INVOICE_ACTIVITY_COPY.void,
        timestamp: createdTs,
      })
    }
    if (invoice.status === "paid") {
      activities.push({
        id: "5",
        type: "paid",
        description: INVOICE_ACTIVITY_COPY.paid,
        timestamp: createdTs,
      })
    }
  }
  ;(invoice.emailsSent ?? []).forEach((entry, i) => {
    activities.push({
      id: `email-${i}-${entry.sentAt}`,
      type: "sent",
      description: INVOICE_ACTIVITY_COPY.sent,
      timestamp: entry.sentAt,
    })
  })
  ;(invoice.remindersSent ?? []).forEach((entry, i) => {
    const description =
      entry.type === "due_today"
        ? INVOICE_ACTIVITY_COPY.reminderDueToday
        : entry.type === "overdue_7d"
          ? INVOICE_ACTIVITY_COPY.reminderOverdue
          : INVOICE_ACTIVITY_COPY.reminderSent
    activities.push({
      id: `reminder-${i}-${entry.sentAt}`,
      type: "sent",
      description,
      timestamp: entry.sentAt,
    })
  })
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
  const [isIssuing, setIsIssuing] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [customerViews, setCustomerViews] = useState<{ viewedAt: string }[]>([])
  const [addNoteOpen, setAddNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [markAsPaidOpen, setMarkAsPaidOpen] = useState(false)
  const [customerViewUrl, setCustomerViewUrl] = useState("")
  const [previewViewUrl, setPreviewViewUrl] = useState("")
  const [stripeSettlement, setStripeSettlement] = useState<{
    phase: string
    settlement_rail: string | null
    net_cents: number
    fee_cents: number
    currency: string
    ledger_transaction_id: string | null
  } | null>(null)
  const [stripeRefunding, setStripeRefunding] = useState(false)

  const canProvisionDepositInstructions = invoice
    ? canProvisionInvoiceDepositInstructions(invoice.currency, tier1Complete, TIER2_COMPLETE_PLACEHOLDER)
    : false

  const payInQueryEnabled = Boolean(
    invoice &&
      !invoice.archived &&
      showInvoicePaymentPreview(invoice.status) &&
      invoice.status !== "paid" &&
      invoice.status !== "void" &&
      canProvisionDepositInstructions,
  )

  const {
    bankAccount,
    stablecoinAccount,
  } = useInvoicePayIn({
    currency: invoice?.currency ?? "USD",
    tier1Complete,
    enabled: payInQueryEnabled,
  })

  const stripeOnlineEnabled = Boolean(
    typeof process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === "string" &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.trim(),
  )

  const paymentDisplay = useMemo(() => {
    if (!invoice) {
      return {
        showBank: false,
        showStablecoin: false,
        showOnlinePayment: false,
        defaultTab: "bank" as const,
      }
    }
    return resolvePaymentDisplay({
      invoice,
      businessDefaults: invoiceSettings,
      payIn: { bankAccount, stablecoinAccount },
      payable: payInQueryEnabled || stripeOnlineEnabled,
      stripeOnlineEnabled,
    })
  }, [invoice, invoiceSettings, bankAccount, stablecoinAccount, payInQueryEnabled, stripeOnlineEnabled])

  const manualStatusActions = useMemo(
    () =>
      invoice
        ? getInvoiceManualStatusActions({
            status: invoice.status,
            paidViaStripe: invoice.paymentInfo?.method === "stripe",
          })
        : [],
    [invoice?.status, invoice?.paymentInfo?.method],
  )

  const sendInvoiceEmailConfirmed = async () => {
    if (!invoice) return
    if (isInvoiceDraft(invoice.status)) {
      toast.error(INVOICE_TOAST_COPY.issueBeforeEmail)
      return
    }
    setIsSendingEmail(true)
    try {
      const res = await fetchWithSession("/api/invoices/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        emailsSent?: Invoice["emailsSent"]
        status?: Invoice["status"]
      }
      if (!res.ok) throw new Error(data.error || INVOICE_TOAST_COPY.emailFailed)
      const now = new Date().toISOString()
      void updateInvoice(invoice.id, {
        status: data.status ?? "sent",
        emailsSent: data.emailsSent ?? [
          ...(invoice.emailsSent ?? []),
          { sentAt: now, to: invoice.customerEmail },
        ],
        statusHistory:
          invoice.status === "unpaid"
            ? [...(invoice.statusHistory ?? []), { status: "sent", timestamp: now }]
            : invoice.statusHistory,
      })
      toast.success(INVOICE_TOAST_COPY.sentTo(invoice.customerEmail ?? ""))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : INVOICE_TOAST_COPY.emailFailed)
    } finally {
      setIsSendingEmail(false)
    }
  }

  const issueDraft = async (andEmail: boolean) => {
    if (!invoice) return
    if (andEmail) setIsSendingEmail(true)
    else setIsIssuing(true)
    const now = new Date().toISOString()
    try {
      await updateInvoiceMut.mutateAsync({
        id: invoice.id,
        updates: {
          status: "unpaid",
          finalizedDate: invoice.finalizedDate ?? now,
          statusHistory: [
            ...(invoice.statusHistory ?? []),
            { status: "unpaid", timestamp: now },
          ],
        },
      })

      if (andEmail) {
        if (!invoice.customerEmail?.trim()) {
          throw new Error(INVOICE_TOAST_COPY.noCustomerEmail)
        }
        const res = await fetchWithSession("/api/invoices/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: invoice.id }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          emailsSent?: Invoice["emailsSent"]
        }
        if (!res.ok) throw new Error(data.error || INVOICE_TOAST_COPY.emailFailed)
        const sentAt = new Date().toISOString()
        await updateInvoiceMut.mutateAsync({
          id: invoice.id,
          updates: {
            status: "sent",
            emailsSent: data.emailsSent ?? [
              ...(invoice.emailsSent ?? []),
              { sentAt, to: invoice.customerEmail },
            ],
            statusHistory: [
              ...(invoice.statusHistory ?? []),
              { status: "unpaid", timestamp: now },
              { status: "sent", timestamp: sentAt },
            ],
          },
        })
        toast.success(INVOICE_TOAST_COPY.sentTo(invoice.customerEmail))
      } else {
        toast.success(INVOICE_TOAST_COPY.issued)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : INVOICE_TOAST_COPY.issueFailed)
    } finally {
      setIsSendingEmail(false)
      setIsIssuing(false)
    }
  }

  const publicViewHref = invoice
    ? buildInvoiceCustomerViewPath(orgEasetag, invoice)
    : ""

  const previewViewHref = invoice ? invoicePreviewPath(invoice.id) : ""

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
      description: INVOICE_ACTIVITY_COPY.viewed,
      timestamp: v.viewedAt,
    }))
    return [...base, ...viewActivities].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [invoice, customerViews])

  useEffect(() => {
    if (!invoice?.id || typeof window === "undefined") return
    const origin = window.location.origin
    setCustomerViewUrl(buildInvoiceCustomerViewUrl(origin, orgEasetag, invoice))
    setPreviewViewUrl(buildInvoicePreviewUrl(origin, invoice.id))
  }, [invoice?.id, invoice?.invoiceNumber, orgEasetag])

  useEffect(() => {
    if (!invoice?.id || invoice.paymentInfo?.method !== "stripe") {
      setStripeSettlement(null)
      return
    }
    let cancelled = false
    fetchWithSession(`/api/business/b2b/invoices/${encodeURIComponent(invoice.id)}/stripe-settlement`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          settlement?: {
            phase: string
            settlement_rail: string | null
            net_cents: number
            fee_cents: number
            currency: string
            ledger_transaction_id: string | null
          } | null
        }
        if (!cancelled) setStripeSettlement(data.settlement ?? null)
      })
      .catch(() => {
        if (!cancelled) setStripeSettlement(null)
      })
    return () => {
      cancelled = true
    }
  }, [invoice?.id, invoice?.paymentInfo?.method])

  const handleStatusChange = (newStatus: Invoice["status"]) => {
    if (!invoice) return
    const entry = { status: newStatus, timestamp: new Date().toISOString() }
    void updateInvoice(invoice.id, {
      status: newStatus,
      statusHistory: [...(invoice.statusHistory ?? []), entry],
    })
  }

  const handleManualStatusAction = (action: InvoiceManualStatusAction) => {
    if (!invoice) return
    if (action.id === "mark_paid") {
      setMarkAsPaidOpen(true)
      return
    }
    const entry = { status: action.targetStatus, timestamp: new Date().toISOString() }
    const updates: Partial<Invoice> = {
      status: action.targetStatus,
      statusHistory: [...(invoice.statusHistory ?? []), entry],
    }
    if (action.id === "mark_unpaid" && invoice.status === "paid") {
      updates.paymentInfo = undefined
    }
    void updateInvoice(invoice.id, updates)
    toast.success(manualStatusChangeToast(action))
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
            {!invoice.archived && manualStatusActions.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
                    {INVOICE_ACTION_COPY.changeStatus}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {manualStatusActions.map((action) => (
                    <DropdownMenuItem
                      key={action.id}
                      className={
                        action.destructive ? "text-destructive focus:text-destructive" : undefined
                      }
                      onClick={() => handleManualStatusAction(action)}
                    >
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1">
            Billed to {invoice.customerName} - {formatCurrency(invoice.total, invoice.currency)}
            {invoice.poNumber?.trim() ? (
              <span className="block text-sm mt-0.5">PO / Ref: {invoice.poNumber}</span>
            ) : null}
          </p>
          {!invoice.archived && invoiceStatusHelper(invoice.status) ? (
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              {invoiceStatusNextAction(invoice.status) ?? invoiceStatusHelper(invoice.status)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!invoice.archived && invoice.status === "draft" && (
            <>
              <Link href={previewViewHref} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  {INVOICE_ACTION_COPY.preview}
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className={invoiceActionBtnClass.finalize}
                disabled={isIssuing || isSendingEmail}
                onClick={() => void issueDraft(false)}
              >
                {isIssuing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {INVOICE_ACTION_COPY.issuing}
                  </>
                ) : (
                  INVOICE_ACTION_COPY.issue
                )}
              </Button>
              {invoice.customerEmail?.trim() ? (
                <Button
                  size="sm"
                  className={invoiceActionBtnClass.email}
                  disabled={isIssuing || isSendingEmail}
                  onClick={() => void issueDraft(true)}
                >
                  {isSendingEmail ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {INVOICE_ACTION_COPY.sending}
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      {INVOICE_ACTION_COPY.issueAndEmail}
                    </>
                  )}
                </Button>
              ) : null}
            </>
          )}
          {!invoice.archived &&
            (invoice.status === "unpaid" || invoice.status === "past_due") &&
            invoice.customerEmail?.trim() && (
              <Button
                size="sm"
                className={invoiceActionBtnClass.email}
                onClick={() => void sendInvoiceEmailConfirmed()}
                disabled={isSendingEmail}
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {INVOICE_ACTION_COPY.sending}
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    {INVOICE_ACTION_COPY.emailCustomer}
                  </>
                )}
              </Button>
            )}
          {!invoice.archived &&
            invoice.status === "sent" &&
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
                    {INVOICE_ACTION_COPY.sending}
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    {INVOICE_ACTION_COPY.emailAgain}
                  </>
                )}
              </Button>
            )}
          {!invoice.archived ? (
            <InvoiceShareMenu invoice={invoice} easetag={orgEasetag} />
          ) : null}
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
                    issuer,
                    buildInvoicePdfPaymentSection({
                      baseUrl: window.location.origin,
                      easetag: orgEasetag,
                      invoice,
                      flags: paymentFlagsFromDisplay(paymentDisplay),
                      includeOnPdf: invoiceSettings?.includePaymentOnPdf !== false,
                    }),
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

      {invoiceFieldsLockBanner(invoice.status) ? (
        <div className="rounded-lg border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {invoiceFieldsLockBanner(invoice.status)}
        </div>
      ) : null}

      {isInvoiceDraft(invoice.status) && !invoice.archived ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {draftPreviewHint()}
        </div>
      ) : null}

      {invoice.paymentInfo?.method === "stripe" && stripeSettlement ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Online payment settlement:{" "}
                {stripeSettlement.phase === "payment_received"
                  ? "Payment received"
                  : stripeSettlement.phase === "payout_sent"
                    ? "Clearing"
                    : stripeSettlement.phase === "credited"
                      ? "Available"
                      : stripeSettlement.phase === "failed"
                        ? "Failed"
                        : stripeSettlement.phase}
              </p>
              <p className="text-xs text-muted-foreground">
                Net{" "}
                {formatCurrency(
                  (stripeSettlement.net_cents ?? 0) / 100,
                  stripeSettlement.currency || invoice.currency,
                )}
                {stripeSettlement.fee_cents > 0
                  ? ` · Fee ${formatCurrency(
                      stripeSettlement.fee_cents / 100,
                      stripeSettlement.currency || invoice.currency,
                    )}`
                  : ""}
                {stripeSettlement.settlement_rail === "turnkey_stablecoin"
                  ? " · Stablecoin rail"
                  : stripeSettlement.settlement_rail === "grid_va"
                    ? " · Bank rail"
                    : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {stripeSettlement.ledger_transaction_id ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/transactions/${stripeSettlement.ledger_transaction_id}`}>
                    View transaction
                  </Link>
                </Button>
              ) : null}
              {stripeSettlement.phase === "payment_received" ||
              stripeSettlement.phase === "payout_sent" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={stripeRefunding}
                  onClick={() => {
                    void (async () => {
                      if (
                        !window.confirm(
                          "Refund this online payment to the customer? This cannot be undone.",
                        )
                      ) {
                        return
                      }
                      setStripeRefunding(true)
                      try {
                        const res = await fetchWithSession(
                          `/api/business/b2b/invoices/${encodeURIComponent(invoice.id)}/stripe-refund`,
                          { method: "POST" },
                        )
                        const data = (await res.json().catch(() => ({}))) as {
                          error?: string
                          refundId?: string
                        }
                        if (!res.ok) {
                          toast.error(data.error || "Refund failed")
                          return
                        }
                        toast.success("Refund submitted")
                        setStripeSettlement((prev) =>
                          prev ? { ...prev, phase: "failed" } : prev,
                        )
                      } finally {
                        setStripeRefunding(false)
                      }
                    })()
                  }}
                >
                  {stripeRefunding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Refunding…
                    </>
                  ) : (
                    "Refund"
                  )}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

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
              {!invoice.archived &&
                publicViewHref &&
                isInvoiceCustomerLinkShareable(invoice.status) && (
                <div className="space-y-1.5 pt-2 border-t">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {INVOICE_SHARE_COPY.customerLink}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void copyToClipboard(customerViewUrl, "invoice-link")
                        toast.success(INVOICE_TOAST_COPY.customerLinkCopied)
                      }}
                    >
                      {copiedField === "invoice-link" ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{customerLinkHint(invoice.status)}</p>
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground pt-1">
                    <span>
                      {INVOICE_SHARE_COPY.lastViewed}:{" "}
                      {customerViews[0]?.viewedAt
                        ? formatDateWithTime(customerViews[0].viewedAt)
                        : INVOICE_SHARE_COPY.neverViewed}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {INVOICE_SHARE_COPY.lastEmailed}:{" "}
                      {invoice.emailsSent?.[invoice.emailsSent.length - 1]?.sentAt
                        ? formatDateWithTime(
                            invoice.emailsSent[invoice.emailsSent.length - 1]!.sentAt,
                          )
                        : INVOICE_SHARE_COPY.neverEmailed}
                    </span>
                  </div>
                </div>
              )}
              {!invoice.archived && previewViewHref && (
                <div className="space-y-1 pt-2 border-t">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {INVOICE_SHARE_COPY.previewLink}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void copyToClipboard(previewViewUrl, "preview-link")
                          toast.success(INVOICE_TOAST_COPY.previewLinkCopied)
                        }}
                      >
                        {copiedField === "preview-link" ? (
                          <Check className="h-3 w-3 text-primary" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                      <Link href={previewViewHref} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isInvoiceDraft(invoice.status) ? draftPreviewHint() : previewLinkHint()}
                  </p>
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

      {/* Mark as Paid dialog — hidden for Stripe-collected invoices */}
      {invoice && invoice.paymentInfo?.method !== "stripe" ? (
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
      ) : null}

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
