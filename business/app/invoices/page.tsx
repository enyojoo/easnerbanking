"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Plus, 
  Download,
  MoreHorizontal,
  DollarSign,
  Eye,
  ExternalLink,
  Link2,
  Pencil,
  Copy,
  Mail,
  FileDown,
  Archive,
  ArchiveRestore,
  Trash2,
  Search,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { formatDate, formatCurrency } from "@/lib/utils"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import { useInvoicesList } from "@/hooks/queries/use-invoices"
import { useAddInvoice, useUpdateInvoice, useDeleteInvoice } from "@/hooks/mutations/use-invoices"
import { formatInvoiceNumberFromClientId, generateInvoiceId } from "@/lib/invoice-id"
import { InvoiceStatusBadge } from "@/components/invoice-status-badge"
import { downloadInvoicePdf } from "@/lib/use-invoice-pdf"
import {
  buildInvoicePdfPaymentSection,
  paymentFlagsFromDisplay,
} from "@/lib/invoices/invoice-payment-copy"
import { resolvePaymentDisplay } from "@/lib/invoices/resolve-payment-display"
import { isStripePublishableConfigured } from "@/lib/stripe/public-enabled"
import { toast } from "sonner"
import type { Invoice } from "@/lib/b2b/types"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { issuerFromBusinessProfile } from "@/lib/invoices/issuer"
import { assessInvoiceBusinessReadinessFromProfile } from "@/lib/invoices/invoice-business-readiness"
import { useBusinessOperationalAddressReady } from "@/hooks/use-business-operational-address-ready"
import { InvoiceBusinessSetupBanner } from "@/components/invoice-business-setup-banner"
import { invoiceActionBtnClass } from "@/lib/invoices/invoice-action-button-classes"
import type { Account, StablecoinAccount } from "@/lib/finance-types"
import {
  TIER2_COMPLETE_PLACEHOLDER,
  canProvisionInvoiceDepositInstructions,
} from "@/lib/compliance-placeholders"
import { currentLocationPath, withReturnTo } from "@/lib/invoice-navigation"
import {
  PAGE_COPY,
  INVOICE_LIST_COPY,
  INVOICE_ACTION_COPY,
  INVOICE_TOAST_COPY,
} from "@/lib/copy/business-ui-copy"
import {
  buildInvoiceCustomerViewUrl,
  invoicePreviewPath,
} from "@/lib/invoice-public-url"
import { isInvoiceCustomerLinkShareable } from "@/lib/invoices/invoice-status"
import { readCachedConnectStatus } from "@/lib/stripe/connect-status-cache"
import { resolveConnectPanelPhase } from "@/lib/stripe/connect-panel-ux"

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.left = "-9999px"
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand("copy")
    document.body.removeChild(textArea)
    return true
  } catch {
    return false
  }
}

function emptyCopyForTab(tab: string, hasSearch: boolean): string {
  if (hasSearch) return INVOICE_LIST_COPY.emptySearch
  switch (tab) {
    case "draft":
      return INVOICE_LIST_COPY.emptyDraft
    case "unpaid":
      return INVOICE_LIST_COPY.emptyUnpaid
    case "sent":
      return INVOICE_LIST_COPY.emptySent
    case "past_due":
      return INVOICE_LIST_COPY.emptyPastDue
    case "paid":
      return INVOICE_LIST_COPY.emptyPaid
    case "archived":
      return INVOICE_LIST_COPY.emptyArchived
    default:
      return INVOICE_LIST_COPY.emptyAll
  }
}
export default function InvoicesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const listHere = currentLocationPath(pathname, searchParams)
  const profile = useBusinessProfile()
  const { tier1Complete } = profile
  const addressMetaReady = useBusinessOperationalAddressReady()
  const issuer = issuerFromBusinessProfile(profile)
  const invoiceReadiness = useMemo(
    () => assessInvoiceBusinessReadinessFromProfile(profile),
    [addressMetaReady, profile],
  )
  const onlinePaymentsIncomplete = useMemo(() => {
    if (profile.invoiceSettings?.showOnlinePayment === false) return false
    const cached = readCachedConnectStatus(profile.businessId)
    if (!cached) return false
    return resolveConnectPanelPhase(cached) !== "ready"
  }, [profile.businessId, profile.invoiceSettings?.showOnlinePayment])
  const invoicesQuery = useInvoicesList()
  const addInvoiceMut = useAddInvoice()
  const updateInvoiceMut = useUpdateInvoice()
  const deleteInvoiceMut = useDeleteInvoice()

  const invoices = invoicesQuery.data ?? []
  const loading = invoicesQuery.isPending && invoices.length === 0
  const invoicesError =
    invoicesQuery.error instanceof Error
      ? invoicesQuery.error.message
      : invoicesQuery.error
        ? String(invoicesQuery.error)
        : null

  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    void updateInvoiceMut.mutate({ id, updates })
  }

  const addInvoice = async (invoice: Invoice) => {
    try {
      const res = await addInvoiceMut.mutateAsync(invoice)
      return res.invoice ?? null
    } catch {
      return null
    }
  }

  const deleteInvoice = async (id: string) => {
    try {
      await deleteInvoiceMut.mutateAsync(id)
      return true
    } catch {
      return false
    }
  }

  const prefetchInvoiceDetail = (id: string) => {
    if (!scope) return
    void queryClient.prefetchQuery({
      queryKey: qk.invoices.detail(scope, id),
      queryFn: () => apiFetch<Invoice>(`/api/business/b2b/invoices/${id}`),
      staleTime: 60_000,
    })
  }
  const [activeTab, setActiveTab] = useState("all")

  const [searchTerm, setSearchTerm] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const activeInvoices = invoices.filter((i) => !i.archived)
  const archivedInvoices = invoices.filter((i) => i.archived)

  const draftCount = activeInvoices.filter((i) => i.status === "draft").length
  const archivedCount = archivedInvoices.length

  const outstanding = activeInvoices
    .filter((i) => ["unpaid", "sent", "past_due"].includes(i.status))
    .reduce((s, i) => s + i.total, 0)
  const overdue = activeInvoices
    .filter((i) => i.status === "past_due" || (["unpaid", "sent"].includes(i.status) && i.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10)))
    .reduce((s, i) => s + i.total, 0)
  const paidThisMonth = activeInvoices
    .filter((i) => {
      if (i.status !== "paid") return false
      const paidAt = i.paymentInfo?.paidAt?.slice(0, 7)
      const month = new Date().toISOString().slice(0, 7)
      return paidAt === month
    })
    .reduce((s, i) => s + i.total, 0)
  const hasMixedCurrencies = useMemo(() => {
    const currencies = new Set(activeInvoices.map((i) => i.currency))
    return currencies.size > 1
  }, [activeInvoices])

  const pastDueCount = activeInvoices.filter((i) => i.status === "past_due").length
  const statusTabs = [
    { id: "all", label: "All invoices", count: activeInvoices.length },
    { id: "unpaid", label: "Unpaid", count: activeInvoices.filter((i) => i.status === "unpaid").length },
    { id: "sent", label: "Sent", count: activeInvoices.filter((i) => i.status === "sent").length },
    { id: "past_due", label: "Past due", count: pastDueCount },
    { id: "paid", label: "Paid", count: activeInvoices.filter((i) => i.status === "paid").length },
    ...(draftCount > 0 ? [{ id: "draft", label: "Draft", count: draftCount }] : []),
    ...(archivedCount > 0 ? [{ id: "archived", label: "Archived", count: archivedCount }] : []),
  ]

  // Reset activeTab when current tab no longer has data (e.g. last draft archived)
  useEffect(() => {
    if (activeTab === "draft" && draftCount === 0) setActiveTab("all")
    if (activeTab === "archived" && archivedCount === 0) setActiveTab("all")
  }, [activeTab, draftCount, archivedCount])

  const filteredInvoices = useMemo(() => {
    let filtered = activeTab === "archived" ? archivedInvoices : activeInvoices

    // Filter by status tab (when not viewing archived)
    if (activeTab !== "all" && activeTab !== "archived") {
      filtered = filtered.filter(invoice => invoice.status === activeTab)
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(invoice =>
        invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.customerEmail.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    return filtered
  }, [invoices, activeTab, searchTerm, activeInvoices, archivedInvoices])

  const handleEdit = (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(withReturnTo(`/invoices/create?edit=${invoice.id}`, listHere))
  }

  const handleDuplicate = async (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
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
      toast.success(INVOICE_TOAST_COPY.duplicated)
      router.push(withReturnTo(`/invoices/create?edit=${created.id}`, listHere))
    } else {
      toast.error(INVOICE_TOAST_COPY.duplicateFailed)
    }
  }

  const handleEmailInvoice = async (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    if (invoice.status === "draft") {
      toast.error(INVOICE_TOAST_COPY.issueBeforeEmail)
      return
    }
    if (!invoice.customerEmail?.trim()) {
      toast.error(INVOICE_TOAST_COPY.noCustomerEmail)
      return
    }
    setSendingId(invoice.id)
    try {
      const res = await fetchWithSession("/api/invoices/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || INVOICE_TOAST_COPY.emailFailed)
      updateInvoice(invoice.id, {
        status: "sent",
        statusHistory: [...(invoice.statusHistory ?? []), { status: "sent", timestamp: new Date().toISOString() }],
      })
      toast.success(INVOICE_TOAST_COPY.sentTo(invoice.customerEmail))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : INVOICE_TOAST_COPY.emailFailed)
    } finally {
      setSendingId(null)
    }
  }

  const handleCopyCustomerLink = async (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isInvoiceCustomerLinkShareable(invoice.status)) return
    const url = buildInvoiceCustomerViewUrl(window.location.origin, profile.easetag, invoice)
    const ok = await copyText(url)
    if (ok) toast.success(INVOICE_TOAST_COPY.customerLinkCopied)
    else toast.error("Could not copy link")
  }

  const handleDownloadPdf = async (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    const canProvision = canProvisionInvoiceDepositInstructions(
      invoice.currency,
      tier1Complete,
      TIER2_COMPLETE_PLACEHOLDER,
    )
    let bankAccount: Account | undefined
    let stablecoinAccount: StablecoinAccount | undefined
    if (canProvision) {
      const res = await fetchWithSession(
        `/api/business/b2b/invoice-pay-in?currency=${encodeURIComponent(invoice.currency)}`,
        { headers: { "X-Easner-Account-Scope": "business" } },
      )
      const data = (await res.json().catch(() => ({}))) as {
        bankAccount?: Account
        stablecoinAccount?: StablecoinAccount
      }
      if (res.ok) {
        bankAccount = data.bankAccount
        stablecoinAccount = data.stablecoinAccount
      }
    }
    setDownloadingId(invoice.id)
    try {
      const paymentDisplay = resolvePaymentDisplay({
        invoice,
        businessDefaults: profile.invoiceSettings,
        payIn: { bankAccount, stablecoinAccount },
        payable: true,
        stripeOnlineEnabled: isStripePublishableConfigured(),
      })
      await downloadInvoicePdf(
        invoice,
        issuer,
        buildInvoicePdfPaymentSection({
          baseUrl: window.location.origin,
          easetag: profile.easetag,
          invoice,
          flags: paymentFlagsFromDisplay(paymentDisplay),
          includeOnPdf: profile.invoiceSettings?.includePaymentOnPdf !== false,
        }),
      )
    } catch (err) {
      console.error("Failed to download PDF:", err)
      toast.error("Failed to download PDF")
    } finally {
      setDownloadingId(null)
    }
  }

  const handleArchive = (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    updateInvoice(invoice.id, { archived: true })
    toast.success(INVOICE_TOAST_COPY.archived)
  }

  const handleUnarchive = (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    updateInvoice(invoice.id, { archived: false })
    toast.success(INVOICE_TOAST_COPY.restored)
  }

  const handleDeleteClick = (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    setInvoiceToDelete(invoice)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return
    const ok = await deleteInvoice(invoiceToDelete.id)
    if (ok) {
      toast.success(INVOICE_TOAST_COPY.deleted)
      setInvoiceToDelete(null)
      setDeleteDialogOpen(false)
    }
  }

  const showEmptyCreateCta =
    !searchTerm && (activeTab === "all" || activeTab === "draft") && invoiceReadiness.ready

  return (
    <div className="flex flex-col gap-6">
      {invoicesError ? (
        <p className="text-sm text-destructive" role="status">
          {invoicesError}
        </p>
      ) : null}
      <InvoiceBusinessSetupBanner
        readiness={invoiceReadiness}
        onlinePaymentsIncomplete={onlinePaymentsIncomplete}
      />
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading invoices…</p>
      ) : null}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{PAGE_COPY.invoices.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{PAGE_COPY.invoices.intro}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const header = "invoice_number,customer_name,customer_email,amount,currency,status,due_date\n"
                const rows = activeInvoices
                  .map((i) =>
                    [
                      i.invoiceNumber,
                      `"${i.customerName.replace(/"/g, '""')}"`,
                      i.customerEmail,
                      i.total,
                      i.currency,
                      i.status,
                      i.dueDate,
                    ].join(","),
                  )
                  .join("\n")
                const blob = new Blob([header + rows], { type: "text/csv" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            {invoiceReadiness.ready ? (
              <Link href={withReturnTo("/invoices/create", listHere)}>
                <Button className={invoiceActionBtnClass.email}>
                  <Plus className="h-4 w-4 mr-2" />
                  {INVOICE_LIST_COPY.createCta}
                </Button>
              </Link>
            ) : (
              <Button disabled title={invoiceReadiness.message} className={invoiceActionBtnClass.email}>
                <Plus className="h-4 w-4 mr-2" />
                {INVOICE_LIST_COPY.createCta}
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{INVOICE_LIST_COPY.outstanding}</p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatCurrency(outstanding, profile.baseCurrency || "USD")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{INVOICE_LIST_COPY.overdue}</p>
                <p className="text-xl font-semibold tabular-nums text-destructive">
                  {formatCurrency(overdue, profile.baseCurrency || "USD")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{INVOICE_LIST_COPY.paidThisMonth}</p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatCurrency(paidThisMonth, profile.baseCurrency || "USD")}
                </p>
              </CardContent>
            </Card>
          </div>
          {hasMixedCurrencies ? (
            <p className="text-xs text-muted-foreground">{INVOICE_LIST_COPY.mixedCurrencies}</p>
          ) : null}
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices, customers…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex space-x-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-muted rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices table */}
      <Card>
        <CardContent className="p-0">
          {filteredInvoices.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {emptyCopyForTab(activeTab, Boolean(searchTerm))}
                </p>
                {showEmptyCreateCta ? (
                  <Link href={withReturnTo("/invoices/create", listHere)}>
                    <Button className={invoiceActionBtnClass.email}>
                      <Plus className="h-4 w-4 mr-2" />
                      {INVOICE_LIST_COPY.createCta}
                    </Button>
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] table-fixed">
                <colgroup>
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "6%" }} />
                </colgroup>
                <thead className="border-b">
                  <tr>
                    <th className="text-left p-4 font-medium text-xs text-muted-foreground align-middle">Customer name</th>
                    <th className="text-left p-4 font-medium text-xs text-muted-foreground align-middle">Invoice number</th>
                    <th className="text-left p-4 font-medium text-xs text-muted-foreground align-middle">Amount</th>
                    <th className="text-left p-4 font-medium text-xs text-muted-foreground align-middle">Created</th>
                    <th className="text-left p-4 font-medium text-xs text-muted-foreground align-middle">Due</th>
                    <th className="text-left p-4 font-medium text-xs text-muted-foreground align-middle">Status</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredInvoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onMouseEnter={() => {
                        prefetchInvoiceDetail(invoice.id)
                        void router.prefetch(invoicePreviewPath(invoice.id))
                      }}
                      onClick={() => router.push(withReturnTo(`/invoices/${invoice.id}`, listHere))}
                    >
                      <td className="p-4 align-middle min-w-0">
                        <span className="font-medium text-sm block truncate">
                          {invoice.customerCompany?.trim() || invoice.customerName}
                        </span>
                      </td>
                      <td className="p-4 align-middle min-w-0">
                        <Link
                          href={withReturnTo(`/invoices/${invoice.id}`, listHere)}
                          className="font-mono text-xs hover:text-primary transition-colors block truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </td>
                      <td className="p-4 align-middle">
                        <span className="font-semibold text-sm tabular-nums">{formatCurrency(invoice.total, invoice.currency)}</span>
                      </td>
                      <td className="p-4 align-middle min-w-0">
                        <span className="text-xs text-muted-foreground block truncate">
                          {formatDate(invoice.createdDate)}
                        </span>
                      </td>
                      <td className="p-4 align-middle min-w-0">
                        <span className="text-xs text-muted-foreground block truncate">
                          {invoice.dueDate ? formatDate(invoice.dueDate) : "-"}
                        </span>
                      </td>
                      <td className="p-4 align-middle">
                        <InvoiceStatusBadge status={invoice.archived ? "archived" : invoice.status} />
                      </td>
                      <td className="p-4 align-middle">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(withReturnTo(`/invoices/${invoice.id}`, listHere))
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            {!invoice.archived ? (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(invoicePreviewPath(invoice.id))
                                }}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                {INVOICE_ACTION_COPY.preview}
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onClick={(e) => handleEdit(invoice, e)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => handleDuplicate(invoice, e)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            {isInvoiceCustomerLinkShareable(invoice.status) ? (
                              <DropdownMenuItem onClick={(e) => void handleCopyCustomerLink(invoice, e)}>
                                <Link2 className="h-4 w-4 mr-2" />
                                {INVOICE_ACTION_COPY.copyCustomerLink}
                              </DropdownMenuItem>
                            ) : null}
                            {(invoice.status === "draft" || invoice.customerEmail?.trim()) && (
                              <DropdownMenuItem
                                className={invoiceActionBtnClass.menuItem}
                                onClick={(e) => void handleEmailInvoice(invoice, e)}
                                disabled={sendingId === invoice.id}
                              >
                                <Mail className="h-4 w-4 mr-2" />
                                {sendingId === invoice.id
                                  ? INVOICE_ACTION_COPY.sending
                                  : INVOICE_ACTION_COPY.emailInvoice}
                              </DropdownMenuItem>
                            )}
                            {invoice.status !== "draft" && (
                              <DropdownMenuItem
                                className={invoiceActionBtnClass.menuItem}
                                onClick={(e) => handleDownloadPdf(invoice, e)}
                                disabled={downloadingId === invoice.id}
                              >
                                <FileDown className="h-4 w-4 mr-2" />
                                {downloadingId === invoice.id
                                  ? "Downloading…"
                                  : INVOICE_ACTION_COPY.downloadPdf}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => (invoice.archived ? handleUnarchive(invoice, e) : handleArchive(invoice, e))}
                            >
                              {invoice.archived ? (
                                <><ArchiveRestore className="h-4 w-4 mr-2" />Unarchive</>
                              ) : (
                                <><Archive className="h-4 w-4 mr-2" />Archive</>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => handleDeleteClick(invoice, e)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-sm text-muted-foreground shrink-0 pt-2">
        {filteredInvoices.length} result{filteredInvoices.length !== 1 ? 's' : ''}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete invoice {invoiceToDelete?.invoiceNumber}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
