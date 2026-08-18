import { payCustomerSeo } from "@/lib/seo/content/pay-customer"
import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image"

export const alt = payCustomerSeo.thanks.hero.altText
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image() {
  return createOgImage({
    headline: payCustomerSeo.thanks.hero.h1,
    subhead: payCustomerSeo.thanks.hero.subhead,
  })
}
