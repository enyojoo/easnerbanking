import { InvoiceCustomerViewPage } from "@/components/invoice/invoice-customer-view-page"
import { loadPreviewInvoicePage } from "@/lib/invoices/load-preview-invoice-page"

export const dynamic = "force-dynamic"

export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const invoiceId = typeof id === "string" ? id : ""
  const result = await loadPreviewInvoicePage(invoiceId)

  return (
    <InvoiceCustomerViewPage
      key={invoiceId}
      mode="preview"
      invoiceId={invoiceId}
      initialUnauthorized={result.status === "unauthorized"}
      initialPayload={
        result.status === "ok" ? result.payload : result.status === "not_found" ? null : undefined
      }
    />
  )
}
