import { headers } from "next/headers"
import { pickPublicHostname } from "@/lib/customer-hosts"
import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image"
import { resolvePublicCustomerSeo } from "@/lib/seo/public-customer-metadata"

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = "Easner Business"

export default async function Image({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const headerList = await headers()
  const hostname = pickPublicHostname(headerList.get("x-forwarded-host"), headerList.get("host"))
  const seo = await resolvePublicCustomerSeo({ hostname, parts: slug ?? [] })
  return createOgImage({
    headline: seo.og.headline,
    subhead: seo.og.subhead,
  })
}
