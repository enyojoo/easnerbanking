import type { ReactNode } from "react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { PreloadStripeJs } from "@/components/stripe/preload-stripe-js"
import { pickPublicHostname } from "@/lib/customer-hosts"
import { businessMetadata } from "@/lib/seo/metadata"
import { resolvePublicCustomerSeo } from "@/lib/seo/public-customer-metadata"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  const headerList = await headers()
  const hostname = pickPublicHostname(headerList.get("x-forwarded-host"), headerList.get("host"))
  const seo = await resolvePublicCustomerSeo({ hostname, parts: slug ?? [] })
  return businessMetadata(seo.metadataInput)
}

export default function PublicCatchAllLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PreloadStripeJs />
      {children}
    </>
  )
}
