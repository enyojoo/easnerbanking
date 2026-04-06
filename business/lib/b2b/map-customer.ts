import type { Customer } from "@/lib/b2b/types"
import { getCustomerStats } from "@/lib/b2b/customer-stats"
import type { Invoice } from "@/lib/b2b/types"

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
  created_at: string
  updated_at?: string
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
  }
}
