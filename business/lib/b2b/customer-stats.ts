import type { Invoice } from "@/lib/b2b/types"

export function getCustomerStats(
  customerId: string,
  customerEmail: string,
  invoices: Invoice[],
): { totalInvoices: number; totalPaid: number; lastInvoiceDate: string } {
  const customerInvoices = invoices.filter(
    (inv) =>
      !inv.archived &&
      (inv.customerId === customerId ||
        inv.customerEmail?.toLowerCase() === customerEmail?.toLowerCase()),
  )
  const totalPaid = customerInvoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + inv.total, 0)
  const dates = customerInvoices
    .map((inv) => inv.finalizedDate ?? inv.createdDate)
    .filter(Boolean) as string[]
  const lastInvoiceDate = dates.length > 0 ? dates.sort().reverse()[0] : ""
  return {
    totalInvoices: customerInvoices.length,
    totalPaid,
    lastInvoiceDate,
  }
}
