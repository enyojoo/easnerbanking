import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image"
import { payCustomerSeo } from "@/lib/seo/content/pay-customer"
import { resolvePublicCustomerSeo } from "@/lib/seo/public-customer-metadata"

export const alt = payCustomerSeo.publicDefault.hero.altText
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params
  const seo = await resolvePublicCustomerSeo({
    hostname: null,
    parts: slug ?? [],
    forceKind: "pay",
  })
  return createOgImage({
    headline: seo.og.headline,
    subhead: seo.og.subhead,
  })
}
