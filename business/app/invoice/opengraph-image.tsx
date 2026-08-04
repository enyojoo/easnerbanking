import { invoiceSeo } from "@/lib/seo/content/invoice"
import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image"

export const alt = invoiceSeo.publicDefault.hero.altText
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

/** Parent-level OG image – cannot live under `[[...slug]]` (catch-all must be last segment). */
export default async function Image() {
  return createOgImage({
    headline: invoiceSeo.publicDefault.hero.h1,
    subhead: invoiceSeo.publicDefault.hero.subhead,
  })
}
