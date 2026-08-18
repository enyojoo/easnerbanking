import type { ReactNode } from "react"
import type { Metadata } from "next"
import { businessMetadata } from "@/lib/seo/metadata"
import { resolvePublicCustomerSeo } from "@/lib/seo/public-customer-metadata"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  const seo = await resolvePublicCustomerSeo({
    hostname: null,
    parts: slug ?? [],
    forceKind: "invoice",
  })
  return businessMetadata(seo.metadataInput)
}

export default function InvoiceSlugLayout({ children }: { children: ReactNode }) {
  return children
}
