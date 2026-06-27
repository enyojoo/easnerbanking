"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  Plus, 
  Download,
  MoreHorizontal,
  DollarSign,
  Eye,
  Pencil,
  Copy,
  Mail,
  FileDown,
  Archive,
  ArchiveRestore,
  Trash2,
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
import { toast } from "sonner"
import type { Invoice } from "@/lib/b2b/types"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { issuerFromBusinessProfile } from "@/lib/invoices/issuer"
import { InvoiceReplyEmailNotice } from "@/components/invoices/invoice-reply-email-notice"
import type { Account, StablecoinAccount } from "@/lib/finance-types"
import {
  TIER2_COMPLETE_PLACEHOLDER,
  canProvisionInvoiceDepositInstructions,
} from "@/lib/compliance-placeholders"
import { currentLocationPath, withReturnTo } from "@/lib/invoice-navigation"
export default function InvoicesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const listHere = currentLocationPath(pathname, searchParams)
  const profile = useBusinessProfile()
  const { tier1Complete } = profile
  const issuer = issuerFromBusinessProfile(profile)
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

  useEffect(() => {
    const deletedId = searchParams.get("deleted")
    if (!deletedId) return
    void (async () => {
      try {
        await deleteInvoiceMut.mutateAsync(deletedId)
      } finally {
        router.replace("/invoices")
      }
    })()
  }, [searchParams, deleteInvoiceMut, router])

  const [searchTerm, setSearchTerm] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const activeInvoices = invoices.filter((i) => !i.archived)
  const archivedInvoices = invoices.filter((i) => i.archived)

  const draftCount = activeInvoices.filter((i) => i.status === "draft").length
  const archivedCount = archivedInvoices.length

  const statusTabs = [
    { id: "all", label: "All invoices", count: activeInvoices.length },
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
      toast.success("Invoice duplicated")
      router.push(withReturnTo(`/invoices/create?edit=${created.id}`, listHere))
    } else {
      toast.error("Could not duplicate invoice")
    }
  }

  const handleEmailInvoice = async (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!invoice.customerEmail?.trim()) {
      toast.error("Invoice has no customer email")
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
      if (!res.ok) throw new Error(data.error || "Failed to send email")
      updateInvoice(invoice.id, {
        status: "sent",
        statusHistory: [...(invoice.statusHistory ?? []), { status: "sent", timestamp: new Date().toISOString() }],
      })
      toast.success(`Invoice sent to ${invoice.customerEmail}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email")
    } finally {
      setSendingId(null)
    }
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
        { headers: { "X-Easner-Noah-Scope": "business" } },
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
      await downloadInvoicePdf(
        invoice,
        canProvision ? bankAccount : undefined,
        canProvision ? stablecoinAccount : undefined,
        issuer,
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
    toast.success("Invoice archived")
  }

  const handleUnarchive = (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    updateInvoice(invoice.id, { archived: false, status: "draft" })
    toast.success("Invoice restored")
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
      toast.success("Invoice deleted")
      setInvoiceToDelete(null)
      setDeleteDialogOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {invoicesError ? (
        <p className="text-sm text-destructive" role="status">
          {invoicesError}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading invoices…</p>
      ) : null}
      {/* Header + Tabs - sticky so content doesn't scroll through */}
      <div className="sticky top-0 z-20 flex flex-col gap-4 shrink-0 pb-4 bg-background border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Invoices</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your billing and invoicing</p>
          </div>
          <Link href={withReturnTo("/invoices/create", listHere)}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create invoice
            </Button>
          </Link>
        </div>
        {profile.invoiceReplyEmailSource !== "support" ? (
          <InvoiceReplyEmailNotice
            email={profile.invoiceReplyEmail}
            source={profile.invoiceReplyEmailSource}
            variant="invoices"
          />
        ) : null}
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

      {/* Invoices Table - fixed min-height for consistent view when switching tabs */}
      <Card className="flex flex-col min-h-[400px]">
        <CardContent className="p-0 flex flex-col flex-1 min-h-0">
          {filteredInvoices.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No invoices found</h3>
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? "Try adjusting your search terms" : "Get started by creating your first invoice"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto min-h-0">
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
                      onMouseEnter={() => prefetchInvoiceDetail(invoice.id)}
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
                            <DropdownMenuItem onClick={(e) => handleEdit(invoice, e)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => handleDuplicate(invoice, e)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            {invoice.status !== "draft" && invoice.customerEmail?.trim() && (
                              <DropdownMenuItem
                                onClick={(e) => handleEmailInvoice(invoice, e)}
                                disabled={sendingId === invoice.id}
                              >
                                <Mail className="h-4 w-4 mr-2" />
                                {sendingId === invoice.id ? "Sending…" : "Email Invoice"}
                              </DropdownMenuItem>
                            )}
                            {invoice.status !== "draft" && (
                              <DropdownMenuItem onClick={(e) => handleDownloadPdf(invoice, e)} disabled={downloadingId === invoice.id}>
                                <FileDown className="h-4 w-4 mr-2" />
                                {downloadingId === invoice.id ? "Downloading…" : "Download PDF"}
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
