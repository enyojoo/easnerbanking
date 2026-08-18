import type { ReactNode } from "react"
import type { Metadata } from "next"
import { resolvePublicPayPath } from "@/lib/payment-links/resolve-public-path"
import { paymentLinkPublicMetadata, payCustomerSeo } from "@/lib/seo/content/pay-customer"
import { businessMetadata } from "@/lib/seo/metadata"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

async function resolvePayBusinessName(segments: string[]): Promise<string | null> {
  try {
    const admin = createSupabaseAdmin()
    const resolved = await resolvePublicPayPath(admin, segments)
    if (resolved.kind !== "payment_link") return null
    const { data } = await admin
      .from("businesses")
      .select("name")
      .eq("id", String(resolved.row.business_id))
      .maybeSingle()
    return typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  const parts = slug ?? []
  const name = await resolvePayBusinessName(parts)
  const content = name ? paymentLinkPublicMetadata(name) : payCustomerSeo.publicDefault

  return businessMetadata({
    metadata: content.metadata,
    path: `/${parts.map((part) => encodeURIComponent(part)).join("/")}`,
  })
}

export default function PayCustomerSlugLayout({ children }: { children: ReactNode }) {
  return children
}
