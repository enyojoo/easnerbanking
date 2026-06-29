import type { Customer } from "@/lib/b2b/types"
import { getCustomerStats } from "@/lib/b2b/customer-stats"
import type { Invoice } from "@/lib/b2b/types"
import { normalizePaymentTermsDays } from "@/lib/invoices/due-date"

export type B2bCustomerRow = {
  id: string
  business_id: string
  name: string | null
  email: string | null
  phone: string | null
  company: string | null
  address: string | null
  currency: string | null
  status: string | null
  payment_terms_days?: number | string | null
  created_at: string
  updated_at?: string
}

function paymentTermsFromRow(row: B2bCustomerRow): number {
  return normalizePaymentTermsDays(row.payment_terms_days ?? 30)
}

export function mapRowToCustomer(row: B2bCustomerRow, invoices: Invoice[]): Customer {
  const stats = getCustomerStats(row.id, row.email ?? "", invoices)
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    company: row.company ?? "",
    address: row.address ?? "",
    currency: row.currency ?? "USD",
    status: row.status === "inactive" ? "inactive" : "active",
    totalInvoices: stats.totalInvoices,
    totalPaid: stats.totalPaid,
    lastInvoiceDate: stats.lastInvoiceDate,
    paymentTermsDays: paymentTermsFromRow(row),
  }
}

export function mapRowToCustomerWithEmptyStats(row: B2bCustomerRow): Customer {
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    company: row.company ?? "",
    address: row.address ?? "",
    currency: row.currency ?? "USD",
    status: row.status === "inactive" ? "inactive" : "active",
    totalInvoices: 0,
    totalPaid: 0,
    lastInvoiceDate: "",
    paymentTermsDays: paymentTermsFromRow(row),
  }
}
