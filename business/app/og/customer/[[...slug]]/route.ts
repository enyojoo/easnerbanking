import { headers } from "next/headers"
import { pickPublicHostname } from "@/lib/customer-hosts"
import { createOgImage } from "@/lib/seo/og-image"
import { resolvePublicCustomerSeo } from "@/lib/seo/public-customer-metadata"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Share cards for pay/invoice public URLs. Cannot live as `opengraph-image`
 * under `[...slug]` (catch-all must be the last URL segment).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await params
  const headerList = await headers()
  const hostname = pickPublicHostname(headerList.get("x-forwarded-host"), headerList.get("host"))
  const seo = await resolvePublicCustomerSeo({ hostname, parts: slug ?? [] })
  return createOgImage({
    headline: seo.og.headline,
    subhead: seo.og.subhead,
  })
}
