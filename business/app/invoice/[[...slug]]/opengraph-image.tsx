import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image"
import { invoiceSeo } from "@/lib/seo/content/invoice"
import { resolvePublicCustomerSeo } from "@/lib/seo/public-customer-metadata"

export const alt = invoiceSeo.publicDefault.hero.altText
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params
  const seo = await resolvePublicCustomerSeo({
    hostname: null,
    parts: slug ?? [],
    forceKind: "invoice",
  })
  return createOgImage({
    headline: seo.og.headline,
    subhead: seo.og.subhead,
  })
}
