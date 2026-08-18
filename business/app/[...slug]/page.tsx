import { headers } from "next/headers"
import { CustomerPublicView } from "@/components/customer-host/customer-public-view"
import { pickPublicHostname } from "@/lib/customer-hosts"
import { resolveCustomerPublicKind } from "@/lib/customer-public-path"
import { loadPublicInvoicePage } from "@/lib/invoices/load-public-invoice-page"
import { loadPublicPayPage } from "@/lib/payment-links/load-public-pay-page"

export const dynamic = "force-dynamic"

export default async function PublicCatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const headerList = await headers()
  const hostname = pickPublicHostname(headerList.get("x-forwarded-host"), headerList.get("host"))
  const kind = resolveCustomerPublicKind(hostname, slug)

  const [invoicePayload, payPage] = await Promise.all([
    kind === "invoice" ? loadPublicInvoicePage(slug) : Promise.resolve(undefined),
    kind === "pay" ? loadPublicPayPage(slug) : Promise.resolve(undefined),
  ])

  return (
    <CustomerPublicView
      parts={slug}
      hostname={hostname}
      invoicePayload={invoicePayload}
      payPage={payPage}
    />
  )
}
