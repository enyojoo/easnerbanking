import type { Metadata } from "next"
import type { ReactNode } from "react"
import { PreloadStripeJs } from "@/components/stripe/preload-stripe-js"
import { getInvoiceAppPublicOrigin } from "@/lib/customer-hosts"
import { invoiceSeo } from "@/lib/seo/content/invoice"
import { businessMetadata } from "@/lib/seo/metadata"

/** Per-invoice title uses the real business name in slug layout `generateMetadata`. */
export const metadata: Metadata = businessMetadata({
  metadata: invoiceSeo.publicDefault.metadata,
  path: "/invoice",
  metadataBase: getInvoiceAppPublicOrigin(),
})

export default function InvoiceLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background overflow-y-auto">
      <PreloadStripeJs />
      <main className="flex-1 flex flex-col items-center justify-start w-full min-h-0 px-4 sm:px-6 py-6 sm:py-8 pb-12">
        {children}
      </main>
    </div>
  )
}
