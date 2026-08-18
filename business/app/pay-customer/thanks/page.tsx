import { Check } from "lucide-react"
import { getPayAppPublicOrigin } from "@/lib/customer-hosts"
import { payCustomerSeo } from "@/lib/seo/content/pay-customer"
import { businessMetadata } from "@/lib/seo/metadata"

export const metadata = businessMetadata({
  metadata: payCustomerSeo.thanks.metadata,
  path: "/thanks",
  metadataBase: getPayAppPublicOrigin(),
  ogImage: { url: "/og/pay/thanks/opengraph-image", alt: payCustomerSeo.thanks.hero.altText },
})

/** Built-in success page for links without a merchant redirect. */
export default function PayThanksPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Check className="h-7 w-7 text-primary" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-foreground">Payment complete</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Thank you. The business has been notified and a receipt is on its way to your email.
        </p>
      </div>
    </div>
  )
}
