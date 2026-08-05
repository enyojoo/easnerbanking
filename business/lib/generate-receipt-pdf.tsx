import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { InvoiceReceiptPDFDocument } from "@/components/invoice-receipt-pdf-document"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"
import type { Invoice } from "@/lib/b2b/types"

export async function generateReceiptPdfBuffer(invoice: Invoice): Promise<Buffer> {
  try {
    return await renderToBuffer(
      React.createElement(InvoiceReceiptPDFDocument, {
        invoice,
        logoUrl: PDF_LOGO_DATA_URL,
        ledgerTransactions: [],
      }),
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate receipt PDF"
    throw new Error(`Receipt PDF generation failed: ${message}`)
  }
}
