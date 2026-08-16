"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { useInvoicesList, useInvoiceDetail } from "@/hooks/queries/use-invoices"
import { useCustomersList } from "@/hooks/queries/use-customers"
import { useAddInvoice, useUpdateInvoice } from "@/hooks/mutations/use-invoices"
import { useAddCustomer } from "@/hooks/mutations/use-customers"
import { formatInvoiceNumberFromClientId, generateInvoiceId } from "@/lib/invoice-id"
import type { Customer, Invoice } from "@/lib/b2b/types"
import { computeInvoiceTotals } from "@/lib/b2b/invoice-totals"
import { AddEditCustomerDialog } from "@/components/add-edit-customer-dialog"
import { BaseCurrencySelect } from "@/components/base-currency-select"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { invoiceBackHref, withReturnTo } from "@/lib/invoice-navigation"
import { dueDateFromPaymentTerms } from "@/lib/invoices/due-date"
import { isInvoiceFieldsLocked, invoiceFieldsLockBanner } from "@/lib/invoices/invoice-edit-lock"
import { assessInvoiceBusinessReadinessFromProfile } from "@/lib/invoices/invoice-business-readiness"
import { InvoiceBusinessSetupBanner } from "@/components/invoice-business-setup-banner"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { toast } from "sonner"
import {
  INVOICE_ACTION_COPY,
  INVOICE_CREATE_SECTION_COPY,
  INVOICE_TOAST_COPY,
} from "@/lib/copy/business-ui-copy"
import { SectionHeader } from "@/components/copy/section-header"
import { readCachedConnectStatus } from "@/lib/stripe/connect-status-cache"
import { resolveConnectPanelPhase } from "@/lib/stripe/connect-panel-ux"

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
  memo: string
  poNumber: string
  lineItems: LineItem[]
}

function invoiceFormFromInvoice(invoice: Invoice, customers: Customer[]): InvoiceForm {
  return {
    customerId:
      invoice.customerId ??
      customers.find((c) => c.email === invoice.customerEmail)?.id ??
      "",
    billToType: (invoice.billToType as "individual" | "company") || "individual",
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    customerCompany: invoice.customerCompany || "",
    customerAddress: invoice.customerAddress || "",
    customerPhone: invoice.customerPhone || "",
    currency: invoice.currency,
    dueDate: invoice.dueDate,
    taxRate: invoice.taxRate ?? 0,
    discountRate: invoice.discountRate ?? 0,
    memo: invoice.memo ?? "",
    poNumber: invoice.poNumber ?? "",
    lineItems: invoice.lineItems.map((item, i) => ({
      id: (i + 1).toString(),
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
  }
}

export default function CreateInvoicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("edit")
  const customerFromUrl = searchParams.get("customer")
  const invoicesQuery = useInvoicesList()
  const customersQuery = useCustomersList()
  const addInvoiceMut = useAddInvoice()
  const updateInvoiceMut = useUpdateInvoice()
  const addCustomerMut = useAddCustomer()

  const invoices = invoicesQuery.data ?? []
  const customers = customersQuery.data ?? []
  const invoiceDetailQuery = useInvoiceDetail(editId)
  const invoiceFromList = editId ? invoices.find((i) => i.id === editId) : null
  const invoiceToEdit = invoiceDetailQuery.data ?? invoiceFromList ?? null
  const isEditMode = Boolean(editId && invoiceToEdit)
  const editLoading = Boolean(editId) && invoiceDetailQuery.isPending && !invoiceToEdit

  const addInvoice = async (invoice: Invoice) => {
    const res = await addInvoiceMut.mutateAsync(invoice)
    return res.invoice ?? null
  }

  const updateInvoice = async (id: string, updates: Partial<Invoice>) => {
    const res = await updateInvoiceMut.mutateAsync({ id, updates })
    return res.invoice ?? null
  }

  const addCustomer = async (c: Customer) => {
    try {
      const res = await addCustomerMut.mutateAsync(c)
      return res.customer ?? null
    } catch {
      return null
    }
  }
  const profile = useBusinessProfile()
  const { baseCurrency, isLoading: profileLoading, invoiceSettings } = profile
  const orgEasetag =
    typeof profile.easetag === "string" && profile.easetag.trim() ? profile.easetag.trim() : null
  const invoiceReadiness = assessInvoiceBusinessReadinessFromProfile(profile)
  const onlinePaymentsIncomplete = useMemo(() => {
    if (invoiceSettings?.showOnlinePayment === false) return false
    const cached = readCachedConnectStatus(profile.businessId)
    if (!cached) return false
    return resolveConnectPanelPhase(cached) !== "ready"
  }, [profile.businessId, invoiceSettings?.showOnlinePayment])

  const [formData, setFormData] = useState<InvoiceForm>({
    customerId: "",
    billToType: "individual",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerCompany: "",
    customerAddress: "",
    currency: "USD",
    dueDate: "",
    taxRate: 0,
    discountRate: 0,
    memo: "",
    poNumber: "",
    lineItems: [{ id: "1", description: "", quantity: "", unitPrice: "" }]
  })

  const isLockedEdit =
    isEditMode && invoiceToEdit != null && isInvoiceFieldsLocked(invoiceToEdit.status)
  const editLockBanner = invoiceToEdit ? invoiceFieldsLockBanner(invoiceToEdit.status) : null

  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false)
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false)
  const [customerSearchTerm, setCustomerSearchTerm] = useState("")
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  /** Which primary action is running (shows loading on action buttons). */
  const [invoiceAction, setInvoiceAction] = useState<null | "draft" | "create" | "email">(null)
  /** When true, next transition to `profileLoading === false` seeds currency from base (no customer). */
  const awaitingProfileForDefaultCurrency = useRef(true)
  /** Avoid re-hydrating the edit form when query cache or customers list updates mid-edit. */
  const hydratedEditIdRef = useRef<string | null>(null)
  /** Skip the first autosave after edit form hydration. */
  const autosaveSkipRef = useRef(true)

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
    const terms = customer.paymentTermsDays ?? 30
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
      dueDate: dueDateFromPaymentTerms(terms),
    }))
    setIsCustomerDialogOpen(false)
    setCustomerSearchTerm("")
  }

  const validateForm = (forIssue: boolean): string | null => {
    if (!formData.customerName.trim() || !formData.customerEmail.trim()) {
      return "Select or add a customer with name and email"
    }
    const validItems = formData.lineItems.filter(
      (item) => item.description.trim() && lineItemAmount(item) > 0,
    )
    if (validItems.length === 0) {
      return "Add at least one line item with amount greater than zero"
    }
    if (forIssue && total <= 0) {
      return "Invoice total must be greater than zero to issue"
    }
    return null
  }

  const filteredCustomers = customers.filter(
    (c) =>
      !customerSearchTerm.trim() ||
      c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      (c.company ?? "").toLowerCase().includes(customerSearchTerm.toLowerCase())
  )

  const createInvoiceFromForm = (status: Invoice["status"]): Invoice => {
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
      memo: formData.memo.trim(),
      poNumber: formData.poNumber.trim(),
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
    const err = validateForm(false)
    if (err) {
      toast.error(err)
      return
    }
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

  const runIssueAndEmail = async () => {
    setInvoiceAction("email")
    try {
      const invoice = createInvoiceFromForm("unpaid")
      const saved = isEditMode ? await updateInvoice(invoice.id, invoice) : await addInvoice(invoice)
      if (!saved) return

      const res = await fetchWithSession("/api/invoices/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: saved.id }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || INVOICE_TOAST_COPY.emailFailed)

      await updateInvoice(saved.id, {
        status: "sent",
        statusHistory: [
          ...(saved.statusHistory ?? []),
          { status: "sent", timestamp: new Date().toISOString() },
        ],
      })
      toast.success(INVOICE_TOAST_COPY.sentTo(saved.customerEmail))
      router.push(withReturnTo(`/invoices/${saved.id}`, backHref))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : INVOICE_TOAST_COPY.issueFailed)
    } finally {
      setInvoiceAction(null)
    }
  }

  const handleSendInvoice = async () => {
    if (invoiceAction) return
    const err = validateForm(isEditMode ? false : true)
    if (err) {
      toast.error(err)
      return
    }
    if (isEditMode) {
      setInvoiceAction("create")
      try {
        const invoice = createInvoiceFromForm(invoiceToEdit?.status ?? "draft")
        await updateInvoice(invoice.id, invoice)
        router.push(withReturnTo(`/invoices/${invoice.id}`, backHref))
      } finally {
        setInvoiceAction(null)
      }
      return
    }
    setInvoiceAction("create")
    try {
      const invoice = createInvoiceFromForm("unpaid")
      const created = await addInvoice(invoice)
      if (created) {
        toast.success(INVOICE_TOAST_COPY.issued)
        router.push(withReturnTo(`/invoices/${created.id}`, backHref))
      }
    } finally {
      setInvoiceAction(null)
    }
  }

  const handleIssueAndEmail = async () => {
    if (invoiceAction) return
    const err = validateForm(true)
    if (err) {
      toast.error(err)
      return
    }
    await runIssueAndEmail()
  }

  // Load invoice once when entering edit mode (wait for detail fetch; do not reset on cache updates).
  useEffect(() => {
    if (!editId) {
      hydratedEditIdRef.current = null
      return
    }
    if (invoiceDetailQuery.isPending && !invoiceDetailQuery.data) return
    const invoice = invoiceDetailQuery.data ?? invoiceFromList
    if (!invoice) return
    if (hydratedEditIdRef.current === editId) return

    hydratedEditIdRef.current = editId
    autosaveSkipRef.current = true
    setSaveState("idle")
    setFormData(invoiceFormFromInvoice(invoice, customers))
  }, [
    editId,
    invoiceDetailQuery.data,
    invoiceDetailQuery.isPending,
    invoiceFromList,
    customers,
    invoiceSettings,
  ])

  // Debounced autosave while editing (preserves status; does not navigate).
  useEffect(() => {
    if (!isEditMode || !editId || !invoiceToEdit || isLockedEdit) return
    if (hydratedEditIdRef.current !== editId) return
    if (autosaveSkipRef.current) {
      autosaveSkipRef.current = false
      return
    }
    if (invoiceAction) return

    const timer = window.setTimeout(() => {
      void (async () => {
        setSaveState("saving")
        try {
          const invoice = createInvoiceFromForm(invoiceToEdit.status)
          await updateInvoice(invoice.id, invoice)
          setSaveState("saved")
        } catch {
          setSaveState("idle")
        }
      })()
    }, 800)

    return () => window.clearTimeout(timer)
    // formData drives autosave; helpers close over latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional form snapshot debounce
  }, [formData, isEditMode, editId, isLockedEdit, invoiceToEdit?.status, invoiceAction])

  // Set default due date (Net 30) - only when creating
  useEffect(() => {
    if (!isEditMode && !formData.dueDate) {
      setFormData(prev => ({
        ...prev,
        dueDate: dueDateFromPaymentTerms(30),
      }))
    }
  }, [isEditMode, formData.dueDate])

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
      dueDate: dueDateFromPaymentTerms(c.paymentTermsDays ?? 30),
    }))
  }, [customerFromUrl, customers, isEditMode, baseCurrency])

  if (editLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (editId && !invoiceToEdit && !invoiceDetailQuery.isPending) {
    return (
      <div className="space-y-4 py-12 text-center">
        <h2 className="text-lg font-semibold">Invoice not found</h2>
        <Link href={backHref}>
          <Button>Go back</Button>
        </Link>
      </div>
    )
  }

  if (!isEditMode && !invoiceReadiness.ready) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <Link href={backHref}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Create invoice</h1>
        </div>
        <InvoiceBusinessSetupBanner
          readiness={invoiceReadiness}
          onlinePaymentsIncomplete={onlinePaymentsIncomplete}
        />
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
        <h1 className="text-2xl font-semibold text-foreground">
          {isEditMode ? "Edit invoice" : "Create invoice"}
        </h1>
      </div>

      <InvoiceBusinessSetupBanner
        readiness={invoiceReadiness}
        onlinePaymentsIncomplete={onlinePaymentsIncomplete}
      />

      {editLockBanner ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          {editLockBanner}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection */}
          <Card>
            <CardHeader>
              <SectionHeader
                title={
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Customer
                  </CardTitle>
                }
                description={INVOICE_CREATE_SECTION_COPY.customer}
              />
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
                  <Button variant="outline" size="sm" onClick={() => setIsCustomerDialogOpen(true)} disabled={isLockedEdit}>
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
              {!profile.easetag?.trim() ? (
                <p className="text-xs text-muted-foreground">
                  <Link
                    href="/settings?tab=business"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {INVOICE_CREATE_SECTION_COPY.easetagHint}
                  </Link>
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <SectionHeader
                title={
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Invoice Details
                  </CardTitle>
                }
                description={INVOICE_CREATE_SECTION_COPY.details}
              />
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <BaseCurrencySelect
                  id="invoice-currency"
                  label="Currency"
                  value={formData.currency}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, currency: value }))}
                  disabled={isLockedEdit}
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
              <div className="space-y-2">
                <Label htmlFor="poNumber">PO / reference number</Label>
                <Input
                  id="poNumber"
                  placeholder="Customer PO or reference"
                  value={formData.poNumber}
                  onChange={(e) => setFormData((p) => ({ ...p, poNumber: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <SectionHeader
                title={
                  <CardTitle className="flex items-center gap-2">
                    <List className="h-5 w-5" />
                    Items
                  </CardTitle>
                }
                description={INVOICE_CREATE_SECTION_COPY.items}
              />
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
                        disabled={isLockedEdit}
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
                        disabled={isLockedEdit}
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
                        disabled={isLockedEdit}
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
                        disabled={isLockedEdit || formData.lineItems.length === 1}
                        className="shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                <Button variant="outline" onClick={addLineItem} className="w-full" disabled={isLockedEdit}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              {!isEditMode ? (
                <>
                  <Button
                    className="w-full"
                    disabled={!!invoiceAction}
                    onClick={() => void handleIssueAndEmail()}
                  >
                    {invoiceAction === "email" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {INVOICE_ACTION_COPY.sending}
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        {INVOICE_CREATE_SECTION_COPY.issueAndEmail}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={!!invoiceAction}
                    onClick={handleSendInvoice}
                  >
                    {invoiceAction === "create" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {INVOICE_ACTION_COPY.issuing}
                      </>
                    ) : (
                      INVOICE_CREATE_SECTION_COPY.issue
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  className="w-full"
                  disabled={!!invoiceAction}
                  onClick={handleSendInvoice}
                >
                  {invoiceAction === "create" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {INVOICE_CREATE_SECTION_COPY.saving}
                    </>
                  ) : (
                    INVOICE_CREATE_SECTION_COPY.saveChanges
                  )}
                </Button>
              )}

              <Button
                variant="ghost"
                className="w-full"
                disabled={!!invoiceAction}
                onClick={handleSaveDraft}
              >
                {invoiceAction === "draft" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {INVOICE_CREATE_SECTION_COPY.saving}
                  </>
                ) : (
                  INVOICE_CREATE_SECTION_COPY.saveDraft
                )}
              </Button>
              {isEditMode && saveState !== "idle" ? (
                <p className="text-xs text-muted-foreground text-center">
                  {saveState === "saving"
                    ? INVOICE_CREATE_SECTION_COPY.saving
                    : INVOICE_CREATE_SECTION_COPY.saved}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Invoice Summary */}
          <Card>
            <CardHeader>
              <SectionHeader
                title="Invoice Summary"
                description={INVOICE_CREATE_SECTION_COPY.summary}
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="memo">Message to customer (shown on invoice)</Label>
                <Textarea
                  id="memo"
                  placeholder="Optional message visible on the invoice and PDF"
                  value={formData.memo}
                  onChange={(e) => setFormData((p) => ({ ...p, memo: e.target.value }))}
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>
              <div className="flex justify-between text-sm pt-2 border-t">
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
        <DialogContent className="max-w-2xl max-h-[90dvh] flex flex-col gap-4">
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
