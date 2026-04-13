"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Search,
  Calendar as CalendarIcon,
  List,
  User,
  Mail,
  MapPin,
  FileText,
  Loader2,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { formatCurrency } from "@/lib/utils"
import { useInvoices } from "@/lib/invoices-context"
import { useCustomers } from "@/lib/customers-context"
import { formatInvoiceNumberFromClientId, generateInvoiceId } from "@/lib/invoice-id"
import type { Invoice } from "@/lib/b2b/types"
import { computeInvoiceTotals } from "@/lib/b2b/invoice-totals"
import { AddEditCustomerDialog } from "@/components/add-edit-customer-dialog"
import { BaseCurrencySelect } from "@/components/base-currency-select"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { invoiceBackHref, withReturnTo } from "@/lib/invoice-navigation"

/** Digits only for quantity (empty allowed while typing). */
function filterQuantityInput(s: string): string {
  return s.replace(/\D/g, "")
}

/** Digits and at most one decimal point (empty allowed). */
function filterUnitPriceInput(s: string): string {
  const t = s.replace(/[^\d.]/g, "")
  const parts = t.split(".")
  if (parts.length <= 1) return t
  return parts[0] + "." + parts.slice(1).join("")
}

function lineItemAmount(item: { quantity: string; unitPrice: string }): number {
  const q = parseFloat(item.quantity) || 0
  const p = parseFloat(item.unitPrice) || 0
  return q * p
}

interface LineItem {
  id: string
  description: string
  quantity: string
  unitPrice: string
}

interface InvoiceForm {
  customerId: string
  billToType: "individual" | "company"
  customerName: string
  customerEmail: string
  customerCompany: string
  customerAddress: string
  customerPhone: string
  currency: string
  dueDate: string
  taxRate: number
  discountRate: number
  lineItems: LineItem[]
}

export default function CreateInvoicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("edit")
  const customerFromUrl = searchParams.get("customer")
  const { invoices, addInvoice, updateInvoice } = useInvoices()
  const { customers, addCustomer } = useCustomers()
  const { baseCurrency, isLoading: profileLoading } = useBusinessProfile()
  const invoiceToEdit = editId ? invoices.find((i) => i.id === editId) : null
  const isEditMode = !!invoiceToEdit

  const [formData, setFormData] = useState<InvoiceForm>({
    customerId: "",
    billToType: "individual",
    customerName: "",
    customerEmail: "",
    customerCompany: "",
    customerAddress: "",
    customerPhone: "",
    currency: "USD",
    dueDate: "",
    taxRate: 0,
    discountRate: 0,
    lineItems: [{ id: "1", description: "", quantity: "", unitPrice: "" }]
  })

  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false)
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false)
  const [customerSearchTerm, setCustomerSearchTerm] = useState("")
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  /** Which primary action is running (shows loading on both buttons). */
  const [invoiceAction, setInvoiceAction] = useState<null | "draft" | "create">(null)
  /** When true, next transition to `profileLoading === false` seeds currency from base (no customer). */
  const awaitingProfileForDefaultCurrency = useRef(true)

  const backHref = invoiceBackHref(searchParams)

  // Calculate totals
  const subtotal = formData.lineItems.reduce((sum, item) => sum + lineItemAmount(item), 0)
  const { discount, tax, total } = computeInvoiceTotals({
    subtotal,
    taxRate: formData.taxRate,
    discountRate: formData.discountRate,
  })

  // Update line item (qty / unit price are numeric-only strings so the field can be cleared while typing)
  const updateLineItem = (id: string, field: keyof LineItem, value: string) => {
    setFormData((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item) => {
        if (item.id !== id) return item
        if (field === "quantity") return { ...item, quantity: filterQuantityInput(value) }
        if (field === "unitPrice") return { ...item, unitPrice: filterUnitPriceInput(value) }
        return { ...item, [field]: value }
      }),
    }))
  }

  // Add new line item
  const addLineItem = () => {
    const newId = (formData.lineItems.length + 1).toString()
    setFormData(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, { id: newId, description: "", quantity: "", unitPrice: "" }]
    }))
  }

  // Remove line item
  const removeLineItem = (id: string) => {
    if (formData.lineItems.length > 1) {
      setFormData(prev => ({
        ...prev,
        lineItems: prev.lineItems.filter(item => item.id !== id)
      }))
    }
  }

  // Select customer
  const selectCustomer = (customer: (typeof customers)[0]) => {
    const hasCompany = !!customer.company?.trim()
    const invoiceCurrency =
      customer.currency?.trim() || baseCurrency?.trim() || "USD"
    setFormData(prev => ({
      ...prev,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerCompany: customer.company || "",
      customerAddress: customer.address || "",
      customerPhone: customer.phone || "",
      billToType: hasCompany ? "company" : "individual",
      currency: invoiceCurrency,
    }))
    setIsCustomerDialogOpen(false)
    setCustomerSearchTerm("")
  }

  const filteredCustomers = customers.filter(
    (c) =>
      !customerSearchTerm.trim() ||
      c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      (c.company ?? "").toLowerCase().includes(customerSearchTerm.toLowerCase())
  )

  const createInvoiceFromForm = (status: "draft" | "open"): Invoice => {
    const dateOnly = new Date().toISOString().slice(0, 10)
    const nowIso = new Date().toISOString()
    const lineItems = formData.lineItems
      .filter((item) => item.description.trim() && lineItemAmount(item) > 0)
      .map((item) => {
        const quantity = parseFloat(item.quantity) || 0
        const unitPrice = parseFloat(item.unitPrice) || 0
        const amount = quantity * unitPrice
        return {
          description: item.description,
          quantity,
          unitPrice,
          amount,
        }
      })
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0)
    const { discount, tax, total } = computeInvoiceTotals({
      subtotal,
      taxRate: formData.taxRate,
      discountRate: formData.discountRate,
    })
    const customerId =
      formData.customerId.trim().length > 0 ? formData.customerId.trim() : undefined
    const base = {
      ...(customerId ? { customerId } : {}),
      customerName: formData.customerName || "Unknown",
      customerEmail: formData.customerEmail || "",
      subtotal,
      discountRate: formData.discountRate,
      discount,
      taxRate: formData.taxRate,
      tax,
      total,
      currency: formData.currency,
      status,
      dueDate: formData.dueDate || dateOnly,
      frequency: null,
      lineItems,
      billToType: formData.billToType,
      customerAddress: formData.customerAddress || undefined,
      customerPhone: formData.customerPhone || undefined,
      customerCompany: formData.billToType === "company" ? (formData.customerCompany || undefined) : undefined,
    }
    if (isEditMode && invoiceToEdit) {
      return {
        ...invoiceToEdit,
        ...base,
        customerId: customerId ?? invoiceToEdit.customerId,
        createdDate: invoiceToEdit.createdDate,
        finalizedDate: status === "draft" ? null : (invoiceToEdit.finalizedDate || nowIso),
        notes: invoiceToEdit.notes,
        statusHistory: invoiceToEdit.statusHistory,
        archived: invoiceToEdit.archived,
      }
    }
    const id = generateInvoiceId()
    return {
      id,
      invoiceNumber: formatInvoiceNumberFromClientId(id),
      createdDate: nowIso,
      finalizedDate: status === "draft" ? null : nowIso,
      ...base,
    }
  }

  const handleSaveDraft = async () => {
    if (invoiceAction) return
    setInvoiceAction("draft")
    try {
      const invoice = createInvoiceFromForm("draft")
      if (isEditMode) {
        await updateInvoice(invoice.id, invoice)
        router.push(withReturnTo(`/invoices/${invoice.id}`, backHref))
      } else {
        const created = await addInvoice(invoice)
        if (created) router.push(withReturnTo(`/invoices/${created.id}`, backHref))
      }
    } finally {
      setInvoiceAction(null)
    }
  }

  const handleSendInvoice = async () => {
    if (invoiceAction) return
    setInvoiceAction("create")
    try {
      const invoice = createInvoiceFromForm("open")
      if (isEditMode) {
        await updateInvoice(invoice.id, invoice)
        router.push(withReturnTo(`/invoices/${invoice.id}`, backHref))
      } else {
        const created = await addInvoice(invoice)
        if (created) router.push(withReturnTo(`/invoices/${created.id}`, backHref))
      }
    } finally {
      setInvoiceAction(null)
    }
  }

  // Load invoice when editing (including duplicated invoices)
  useEffect(() => {
    if (invoiceToEdit) {
      setFormData({
        customerId:
          invoiceToEdit.customerId ??
          customers.find((c) => c.email === invoiceToEdit.customerEmail)?.id ??
          "",
        billToType: (invoiceToEdit.billToType as "individual" | "company") || "individual",
        customerName: invoiceToEdit.customerName,
        customerEmail: invoiceToEdit.customerEmail,
        customerCompany: invoiceToEdit.customerCompany || "",
        customerAddress: invoiceToEdit.customerAddress || "",
        customerPhone: invoiceToEdit.customerPhone || "",
        currency: invoiceToEdit.currency,
        dueDate: invoiceToEdit.dueDate,
        taxRate: invoiceToEdit.taxRate ?? 0,
        discountRate: invoiceToEdit.discountRate ?? 0,
        lineItems: invoiceToEdit.lineItems.map((item, i) => ({
          id: (i + 1).toString(),
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
        })),
      })
    }
  }, [editId, invoiceToEdit, customers])

  // Set default due date (30 days from now) - only when creating
  useEffect(() => {
    if (!isEditMode) {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)
      setFormData(prev => ({
        ...prev,
        dueDate: futureDate.toISOString().split('T')[0]
      }))
    }
  }, [isEditMode])

  // Default invoice currency to business base currency when no customer (same as Add Customer dialog).
  // Only on initial profile load — not on every baseCurrency change — so manual picks are preserved.
  useEffect(() => {
    if (isEditMode || formData.customerId) {
      awaitingProfileForDefaultCurrency.current = profileLoading
      return
    }
    if (profileLoading) {
      awaitingProfileForDefaultCurrency.current = true
      return
    }
    if (awaitingProfileForDefaultCurrency.current) {
      awaitingProfileForDefaultCurrency.current = false
      const code = baseCurrency?.trim() || "USD"
      setFormData((prev) => (prev.currency === code ? prev : { ...prev, currency: code }))
    }
  }, [isEditMode, formData.customerId, profileLoading, baseCurrency])

  // Deep link from Settings → Customers: ?customer=<business_customers.id>
  useEffect(() => {
    if (!customerFromUrl || isEditMode) return
    const c = customers.find((x) => x.id === customerFromUrl)
    if (!c) return
    const hasCompany = !!c.company?.trim()
    const invoiceCurrency = c.currency?.trim() || baseCurrency?.trim() || "USD"
    setFormData((prev) => ({
      ...prev,
      customerId: c.id,
      customerName: c.name,
      customerEmail: c.email,
      customerCompany: c.company || "",
      customerAddress: c.address || "",
      customerPhone: c.phone || "",
      currency: invoiceCurrency,
      billToType: hasCompany ? "company" : "individual",
    }))
  }, [customerFromUrl, customers, isEditMode, baseCurrency])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={backHref}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {isEditMode ? "Edit invoice" : "Create invoice"}
          </h1>
          <p className="text-muted-foreground">
            {isEditMode ? "Update your invoice details" : "Create a new invoice for your customer"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.customerId ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {formData.customerCompany?.trim() || formData.customerName}
                    </p>
                    {formData.customerCompany?.trim() ? (
                      <p className="text-sm text-muted-foreground">{formData.customerName}</p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">{formData.customerEmail}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setIsCustomerDialogOpen(true)}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setIsAddCustomerDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add new customer
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setIsCustomerDialogOpen(true)}>
                    <User className="h-4 w-4 mr-2" />
                    Select existing customer
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <BaseCurrencySelect
                  id="invoice-currency"
                  label="Currency"
                  value={formData.currency}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, currency: value }))}
                />
                <div className="space-y-3">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.dueDate ? format(new Date(formData.dueDate), "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.dueDate ? new Date(formData.dueDate) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            setFormData(prev => ({ ...prev, dueDate: date.toISOString().split('T')[0] }))
                            setIsCalendarOpen(false)
                          }
                        }}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <List className="h-5 w-5" />
                Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {formData.lineItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="grid min-w-0 gap-4 items-end [grid-template-columns:5fr_1fr_2fr_3.5fr_0.5fr]"
                  >
                    <div className="min-w-0 space-y-2">
                      <Label>Description</Label>
                      <Input
                        placeholder="Item description"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label>Qty</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(item.id, "quantity", e.target.value)}
                        className="tabular-nums min-w-0"
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label>Unit Price</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={item.unitPrice}
                        onChange={(e) => updateLineItem(item.id, "unitPrice", e.target.value)}
                        className="tabular-nums min-w-0"
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label>Amount</Label>
                      <Input
                        value={formatCurrency(lineItemAmount(item), formData.currency)}
                        disabled
                        className="bg-muted min-w-0"
                      />
                    </div>
                    <div className="flex min-w-0 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLineItem(item.id)}
                        disabled={formData.lineItems.length === 1}
                        className="shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                <Button variant="outline" onClick={addLineItem} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Action buttons - above Invoice Summary */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={!!invoiceAction}
              onClick={handleSaveDraft}
            >
              {invoiceAction === "draft" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Draft
                </>
              ) : (
                "Draft"
              )}
            </Button>
            <Button
              className="flex-1"
              disabled={!!invoiceAction}
              onClick={handleSendInvoice}
            >
              {invoiceAction === "create" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditMode ? "Save" : "Create"}
                </>
              ) : isEditMode ? (
                "Save"
              ) : (
                "Create"
              )}
            </Button>
          </div>

          {/* Invoice Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal, formData.currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Label htmlFor="discountRate" className="text-muted-foreground text-sm font-normal">
                    Discount (%)
                  </Label>
                  <Input
                    id="discountRate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={formData.discountRate || ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setFormData((p) => ({
                        ...p,
                        discountRate: isNaN(v) ? 0 : Math.min(100, Math.max(0, v)),
                      }))
                    }}
                    placeholder="0"
                    className="w-20 h-8 text-sm"
                  />
                </div>
                <span className="tabular-nums">
                  {discount > 0 ? `−${formatCurrency(discount, formData.currency)}` : formatCurrency(0, formData.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Label htmlFor="taxRate" className="text-muted-foreground text-sm font-normal">
                    Tax rate (%)
                  </Label>
                  <Input
                    id="taxRate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={formData.taxRate || ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setFormData((p) => ({ ...p, taxRate: isNaN(v) ? 0 : Math.min(100, Math.max(0, v)) }))
                    }}
                    placeholder="0"
                    className="w-20 h-8 text-sm"
                  />
                </div>
                <span>{formatCurrency(tax, formData.currency)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-3">
                <span>Total</span>
                <span>{formatCurrency(total, formData.currency)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Customer Selection Dialog */}
      <Dialog
        open={isCustomerDialogOpen}
        onOpenChange={(open) => {
          if (!open) setCustomerSearchTerm("")
          setIsCustomerDialogOpen(open)
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-4">
          <DialogHeader className="shrink-0">
            <DialogTitle>Select Customer</DialogTitle>
          </DialogHeader>
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={customerSearchTerm}
              onChange={(e) => setCustomerSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="overflow-y-auto min-h-0 flex-1 space-y-2 pr-1 -mr-1">
            {filteredCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {customerSearchTerm ? "No customers match your search" : "No customers yet"}
              </p>
            ) : (
              filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => selectCustomer(customer)}
                >
                  <div>
                    <p className="font-medium">
                      {customer.company?.trim() || customer.name}
                    </p>
                    {customer.company?.trim() ? (
                      <p className="text-sm text-muted-foreground">{customer.name}</p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">{customer.email}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Select
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddEditCustomerDialog
        open={isAddCustomerDialogOpen}
        onOpenChange={setIsAddCustomerDialogOpen}
        onSave={async (c) => {
          const created = await addCustomer(c)
          if (created) {
            selectCustomer(created)
            setIsAddCustomerDialogOpen(false)
          }
        }}
      />
    </div>
  )
}
