import type { Invoice } from "@/lib/b2b/types"

/**
 * Legacy module-local cache for invoice PDF / tooling.
 * Prefer loading from `/api/invoices/public/:id` or B2B APIs.
 */
let store: Invoice[] = []

export function getInvoices(): Invoice[] {
  return store
}

export function getInvoiceById(id: string): Invoice | undefined {
  return store.find((inv) => inv.id === id)
}

export function replaceInvoiceStore(inv: Invoice[]) {
  store = [...inv]
}

export function addInvoiceToStore(invoice: Invoice) {
  store = [invoice, ...store.filter((i) => i.id !== invoice.id)]
}

export function updateInvoiceInStore(id: string, updates: Partial<Invoice>) {
  store = store.map((inv) => (inv.id === id ? { ...inv, ...updates } : inv))
}

export function removeInvoiceFromStore(id: string) {
  store = store.filter((inv) => inv.id !== id)
}

export function syncInvoicesFromMock() {
  store = []
}
