import type { ReactNode } from "react"
import { CustomerPayShell } from "@/components/pay/customer-pay-shell"
import { PreloadStripeJs } from "@/components/stripe/preload-stripe-js"
import { getPayAppPublicOrigin } from "@/lib/customer-hosts"
import { payCustomerSeo } from "@/lib/seo/content/pay-customer"
import { businessMetadata } from "@/lib/seo/metadata"

/** Served as pay.easner.com — the internal `/pay-customer` prefix is rewritten by the proxy. */
export const metadata = businessMetadata({
  metadata: payCustomerSeo.publicDefault.metadata,
  path: "/",
  metadataBase: getPayAppPublicOrigin(),
})

export default function PayCustomerLayout({ children }: { children: ReactNode }) {
  return (
    <CustomerPayShell>
      <PreloadStripeJs />
      {children}
    </CustomerPayShell>
  )
}
