"use client"

import { pdf } from "@react-pdf/renderer"
import { InvoiceReceiptPDFDocument } from "@/components/invoice-receipt-pdf-document"
import type { Invoice } from "@/lib/b2b/types"
import type { Transaction } from "@/lib/finance-types"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"
import { fetchWithSession } from "@/lib/fetch-with-session"

async function getLogoDataUrl(): Promise<string> {
  if (typeof window === "undefined") return PDF_LOGO_DATA_URL
  try {
    const res = await fetch("/Easner%20Business.png")
    if (!res.ok) return PDF_LOGO_DATA_URL
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return PDF_LOGO_DATA_URL
  }
}

async function loadLedgerForReceipt(): Promise<Transaction[]> {
  try {
    const res = await fetchWithSession("/api/transactions")
    const body = (await res.json().catch(() => ({}))) as { transactions?: Transaction[] }
    if (!res.ok) return []
    return body.transactions ?? []
  } catch {
    return []
  }
}

export async function downloadInvoiceReceiptPdf(invoice: Invoice): Promise<void> {
  const logoUrl = await getLogoDataUrl()
  const ledgerTransactions = await loadLedgerForReceipt()

  const blob = await pdf(
    <InvoiceReceiptPDFDocument
      invoice={invoice}
      logoUrl={logoUrl}
      ledgerTransactions={ledgerTransactions}
    />
  ).toBlob()

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `invoice-receipt-${invoice.invoiceNumber}-${new Date().toISOString().slice(0, 10)}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
