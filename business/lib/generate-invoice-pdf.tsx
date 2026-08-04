import { renderToBuffer } from "@react-pdf/renderer"
import { InvoicePDFDocument } from "@/components/invoice-pdf-document"
import { PDF_LOGO_DATA_URL } from "@/lib/pdf-logo-base64"
import type { Invoice } from "@/lib/b2b/types"
import type { InvoicePdfIssuer } from "@/lib/invoices/issuer"
import type { InvoicePdfPaymentSection } from "@/lib/invoices/invoice-payment-copy"

export async function generateInvoicePdfBuffer(
  invoice: Invoice,
  issuer?: InvoicePdfIssuer,
  paymentSection?: InvoicePdfPaymentSection,
): Promise<Buffer> {
  return renderToBuffer(
    <InvoicePDFDocument
      invoice={invoice}
      paymentSection={paymentSection}
      issuer={issuer}
      logoUrl={PDF_LOGO_DATA_URL}
    />,
  )
}
