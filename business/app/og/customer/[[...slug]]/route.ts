import { headers } from "next/headers"
import { pickPublicHostname } from "@/lib/customer-hosts"
import { invoiceSeo } from "@/lib/seo/content/invoice"
import { payCustomerSeo } from "@/lib/seo/content/pay-customer"
import { createOgImage, OG_CONTENT_TYPE } from "@/lib/seo/og-image"
import { resolvePublicCustomerSeo } from "@/lib/seo/public-customer-metadata"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function fallbackImage(kind: "invoice" | "pay") {
  if (kind === "invoice") {
    return createOgImage({
      headline: invoiceSeo.publicDefault.hero.h1,
      subhead: invoiceSeo.publicDefault.hero.subhead,
    })
  }
  return createOgImage({
    headline: payCustomerSeo.publicDefault.hero.h1,
    subhead: payCustomerSeo.publicDefault.hero.subhead,
  })
}

/**
 * Personalized share cards. File-convention `opengraph-image` cannot sit under a catch-all.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await params
  const headerList = await headers()
  const hostname = pickPublicHostname(headerList.get("x-forwarded-host"), headerList.get("host"))
  try {
    const seo = await resolvePublicCustomerSeo({ hostname, parts: slug ?? [] })
    return await createOgImage({
      headline: seo.og.headline,
      subhead: seo.og.subhead,
    })
  } catch (error) {
    console.error("og customer image", error)
    const kind = hostname?.includes("invoice") ? "invoice" : "pay"
    return fallbackImage(kind)
  }
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: { "Content-Type": OG_CONTENT_TYPE },
  })
}
