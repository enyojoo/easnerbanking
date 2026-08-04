import { authSeo } from "@/lib/seo/content/auth"
import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image"

export const alt = authSeo.gridComplete.hero.altText
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image() {
  return createOgImage({
    headline: authSeo.gridComplete.hero.h1,
    subhead: authSeo.gridComplete.hero.subhead,
  })
}
