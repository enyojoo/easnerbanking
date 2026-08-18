import { PaymentLinkPayPanel } from "@/components/pay/payment-link-pay-panel"
import { loadPublicPayPage } from "@/lib/payment-links/load-public-pay-page"

export const dynamic = "force-dynamic"

export default async function PayCustomerSlugPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const parts = slug ?? []
  const initial = await loadPublicPayPage(parts)
  return <PaymentLinkPayPanel key={parts.join("/")} slugParts={parts} initial={initial} />
}
