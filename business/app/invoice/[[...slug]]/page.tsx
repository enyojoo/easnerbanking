import { InvoiceCustomerViewPage } from "@/components/invoice/invoice-customer-view-page"
import { loadPublicInvoicePage } from "@/lib/invoices/load-public-invoice-page"

export const dynamic = "force-dynamic"

export default async function InvoicePublicPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const parts = slug ?? []
  const initialPayload = await loadPublicInvoicePage(parts)
  return (
    <InvoiceCustomerViewPage
      key={parts.join("/")}
      mode="public"
      slugParts={parts}
      initialPayload={initialPayload}
    />
  )
}
