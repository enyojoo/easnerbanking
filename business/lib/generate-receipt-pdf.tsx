import { renderToBuffer } from "@react-pdf/renderer"
import { InvoiceReceiptPDFDocument } from "@/components/invoice-receipt-pdf-document"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"
import type { Invoice } from "@/lib/b2b/types"

export async function generateReceiptPdfBuffer(invoice: Invoice): Promise<Buffer> {
  return renderToBuffer(
    <InvoiceReceiptPDFDocument invoice={invoice} logoUrl={PDF_LOGO_DATA_URL} ledgerTransactions={[]} />,
  )
}
