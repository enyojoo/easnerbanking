import { payCustomerSeo } from "@/lib/seo/content/pay-customer"
import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image"

export const alt = payCustomerSeo.publicDefault.hero.altText
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image() {
  return createOgImage({
    headline: payCustomerSeo.publicDefault.hero.h1,
    subhead: payCustomerSeo.publicDefault.hero.subhead,
  })
}
