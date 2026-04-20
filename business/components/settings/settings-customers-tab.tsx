"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Plus,
  Search,
  MoreHorizontal,
  User,
  Mail,
  Phone,
  MapPin,
  Eye,
  Pencil,
  Trash2,
  Building2,
  ReceiptText,
  Contact,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCustomersList, useInvoicesList } from "@/hooks/queries"
import { useAddCustomer, useUpdateCustomer, useDeleteCustomer } from "@/hooks/mutations"
import { AddEditCustomerDialog } from "@/components/add-edit-customer-dialog"
import { getCustomerStats } from "@/lib/b2b/customer-stats"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Customer, Invoice } from "@/lib/b2b/types"
import { InvoiceStatusBadge } from "@/components/invoice-status-badge"
import { currentLocationPath, withReturnTo } from "@/lib/invoice-navigation"

export function SettingsCustomersTab() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const settingsHere = currentLocationPath(pathname, searchParams)
  const detailId = searchParams.get("customer")?.trim() || null

  const customersQuery = useCustomersList()
  const invoicesQuery = useInvoicesList()
  const addCustomerMut = useAddCustomer()
  const updateCustomerMut = useUpdateCustomer()
  const deleteCustomerMut = useDeleteCustomer()

  const customers = customersQuery.data ?? []
  const invoices = invoicesQuery.data ?? []
  const loading = customersQuery.isPending
  const error =
    customersQuery.error instanceof Error
      ? customersQuery.error.message
      : customersQuery.error
        ? String(customersQuery.error)
        : null

  const addCustomer = useCallback(
    async (row: Customer) => {
      try {
        const res = await addCustomerMut.mutateAsync(row)
        return res.customer ?? null
      } catch {
        return null
      }
    },
    [addCustomerMut],
  )

  const updateCustomer = useCallback(
    async (id: string, updates: Partial<Customer>) => {
      try {
        const res = await updateCustomerMut.mutateAsync({ id, updates })
        return res.customer ?? null
      } catch {
        return null
      }
    },
    [updateCustomerMut],
  )

  const deleteCustomer = useCallback(
    async (id: string) => {
      try {
        await deleteCustomerMut.mutateAsync(id)
        return true
      } catch {
        return false
      }
    },
    [deleteCustomerMut],
  )
  const [searchTerm, setSearchTerm] = useState("")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)

  const customer = useMemo(
    () => (detailId ? customers.find((c) => c.id === detailId) : undefined),
    [customers, detailId]
  )

  const closeDetailDialog = () => {
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "customers")
    next.delete("customer")
    router.replace(`/settings?${next.toString()}`, { scroll: false })
  }

  const openDetail = (id: string) => {
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "customers")
    next.set("customer", id)
    router.replace(`/settings?${next.toString()}`, { scroll: false })
  }

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.company ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  )

  const detailDialogOpen = Boolean(detailId)

  return (
    <div className="space-y-6">
      <Card aria-busy={loading}>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <Contact className="h-5 w-5 shrink-0" aria-hidden />
                Customers
              </CardTitle>
              <CardDescription>Manage customer information for invoicing</CardDescription>
            </div>
            <Button className="shrink-0 self-start sm:self-auto" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p className="text-sm text-destructive" role="status">
              {error}
            </p>
          ) : null}
          {loading ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
            </>
          ) : filteredCustomers.length === 0 ? (
            <div className="rounded-lg border p-8 text-center">
              <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="font-medium text-foreground">No customers found</p>
              <p className="text-sm text-muted-foreground mt-2">
                {searchTerm ? "Try adjusting your search terms" : "Get started by adding your first customer"}
              </p>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="space-y-4">
                {filteredCustomers.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {c.company?.trim()
                          ? c.company
                              .split(/\s+/)
                              .map((w) => w[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()
                          : c.name.split(" ").map((n) => n[0]).join("")}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-base truncate">
                          {c.company?.trim() || c.name}
                        </h3>
                      </div>
                      {c.company?.trim() && (
                        <p className="text-xs text-muted-foreground mb-2">{c.name}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {c.email}
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {c.phone}
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {c.address}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      {(() => {
                        const stats = getCustomerStats(c.id, c.email, invoices)
                        return (
                          <>
                            <div className="text-sm font-semibold">
                              {formatCurrency(stats.totalPaid, c.currency)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {stats.totalInvoices} invoice{stats.totalInvoices !== 1 ? "s" : ""}
                            </div>
                          </>
                        )
                      })()}
                    </div>

                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDetail(c.id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Customer
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditCustomer(c)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit Customer
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              setCustomerToDelete(c)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
        {!loading ? (
          <CardFooter className="border-t text-sm text-muted-foreground">
            {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? "s" : ""}
          </CardFooter>
        ) : null}
      </Card>

      <AddEditCustomerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSave={async (row) => {
          const ok = await addCustomer(row)
          if (ok) setAddDialogOpen(false)
        }}
      />
      <AddEditCustomerDialog
        open={!!editCustomer}
        onOpenChange={(open) => !open && setEditCustomer(null)}
        customer={editCustomer}
        onSave={async (row) => {
          const ok = await updateCustomer(row.id, row)
          if (ok) setEditCustomer(null)
        }}
      />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {customerToDelete?.name}. Invoices linked to this customer will
              remain but the customer record will be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (customerToDelete) {
                  const ok = await deleteCustomer(customerToDelete.id)
                  if (ok) {
                    if (customerToDelete.id === detailId) closeDetailDialog()
                    setCustomerToDelete(null)
                    setDeleteDialogOpen(false)
                  }
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={detailDialogOpen} onOpenChange={(open) => !open && closeDetailDialog()}>
        <DialogContent
          showCloseButton
          className="flex max-h-[min(90vh,900px)] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        >
          {!detailId ? null : !customer && !loading ? (
            <>
              <DialogHeader className="space-y-2 border-b px-6 py-5 text-left">
                <DialogTitle>Customer not found</DialogTitle>
                <DialogDescription>This customer may have been removed.</DialogDescription>
              </DialogHeader>
              <div className="px-6 py-6">
                <Button variant="outline" onClick={closeDetailDialog}>
                  Close
                </Button>
              </div>
            </>
          ) : customer ? (
            <>
              <DialogHeader className="space-y-1 border-b px-6 py-5 text-left">
                <DialogTitle className="pr-8">
                  {customer.company?.trim() || customer.name}
                </DialogTitle>
                {customer.company?.trim() ? (
                  <DialogDescription>{customer.name}</DialogDescription>
                ) : (
                  <DialogDescription>{customer.email}</DialogDescription>
                )}
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <CustomerDetailInSettings
                  customer={customer}
                  invoices={invoices}
                  returnToPath={settingsHere}
                  onClose={closeDetailDialog}
                  updateCustomer={updateCustomer}
                  deleteCustomer={deleteCustomer}
                />
              </div>
            </>
          ) : (
            <div className="px-6 py-10 text-sm text-muted-foreground">Loading…</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CustomerDetailInSettings({
  customer,
  invoices,
  returnToPath,
  onClose,
  updateCustomer,
  deleteCustomer,
}: {
  customer: Customer
  invoices: Invoice[]
  returnToPath: string
  onClose: () => void
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<Customer | null>
  deleteCustomer: (id: string) => Promise<boolean>
}) {
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const customerInvoices = invoices.filter(
    (inv) =>
      !inv.archived &&
      (inv.customerId === customer.id ||
        inv.customerEmail?.toLowerCase() === customer.email?.toLowerCase())
  )

  const stats = getCustomerStats(customer.id, customer.email, invoices)

  const handleDelete = async () => {
    const ok = await deleteCustomer(customer.id)
    if (ok) {
      setDeleteDialogOpen(false)
      onClose()
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-14 h-14 shrink-0 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-lg font-medium text-primary">
                      {customer.company?.trim()
                        ? customer.company
                            .split(/\s+/)
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()
                        : customer.name.split(" ").map((n) => n[0]).join("")}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Link href={withReturnTo(`/invoices/create?customer=${customer.id}`, returnToPath)}>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Invoice
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${customer.email}`} className="text-primary hover:underline truncate">
                  {customer.email}
                </a>
              </div>
              {customer.phone ? (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {customer.phone}
                </div>
              ) : null}
              {customer.company ? (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {customer.company}
                </div>
              ) : null}
              {customer.address ? (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {customer.address}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5" />
                Invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {customerInvoices.length === 0 ? (
                <div className="py-8 text-center">
                  <ReceiptText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">No invoices yet for this customer</p>
                </div>
              ) : (
                <div className="divide-y">
                  {customerInvoices.map((invoice) => (
                    <Link
                      key={invoice.id}
                      href={withReturnTo(`/invoices/${invoice.id}`, returnToPath)}
                      className="flex items-center justify-between py-4 hover:bg-muted/50 -mx-4 px-4 rounded-lg transition-colors"
                    >
                      <div>
                        <p className="font-medium text-sm">{invoice.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">Due {formatDate(invoice.dueDate)}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-semibold text-sm tabular-nums">
                          {formatCurrency(invoice.total, invoice.currency)}
                        </span>
                        <InvoiceStatusBadge status={invoice.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Total invoices</p>
                <p className="text-lg font-semibold">{stats.totalInvoices}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total paid</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(stats.totalPaid, customer.currency)}
                </p>
              </div>
              {stats.lastInvoiceDate ? (
                <div>
                  <p className="text-xs text-muted-foreground">Last invoice date</p>
                  <p className="text-sm font-medium">{formatDate(stats.lastInvoiceDate)}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete customer
          </Button>
        </div>
      </div>

      <AddEditCustomerDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        customer={customer}
        onSave={async (c) => {
          const ok = await updateCustomer(c.id, c)
          if (ok) setEditDialogOpen(false)
        }}
      />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {customer.name}. Invoices linked to this customer will remain
              but the customer record will be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
