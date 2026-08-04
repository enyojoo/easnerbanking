import type { ReactNode } from "react"
import type { Metadata } from "next"
import { businessInfo } from "@/lib/business-info"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { fetchInvoiceIssuerForBusiness } from "@/lib/invoices/issuer"
import { invoicePublicMetadata } from "@/lib/seo/content/invoice"
import { businessMetadata } from "@/lib/seo/metadata"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

async function resolveInvoiceBusinessName(slug?: string[]): Promise<string> {
  const parts = slug ?? []
  const fallbackName = businessInfo.name

  try {
    const admin = createSupabaseAdmin()
    let businessId: string | undefined

    if (parts.length === 1) {
      const { data } = await admin.from("invoices").select("business_id").eq("id", parts[0]).maybeSingle()
      businessId = data?.business_id as string | undefined
    } else if (parts.length >= 2) {
      const cleanTag = normalizeEasetag(parts[0])
      if (cleanTag) {
        const { data: biz } = await admin.from("businesses").select("id").eq("easetag", cleanTag).maybeSingle()
        businessId = biz?.id as string | undefined
      }
    }

    if (!businessId) return fallbackName

    const issuer = await fetchInvoiceIssuerForBusiness(admin, businessId)
    return issuer.name?.trim() || fallbackName
  } catch {
    return fallbackName
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  const parts = slug ?? []
  const name = await resolveInvoiceBusinessName(parts)
  const content = invoicePublicMetadata(name)
  const path =
    parts.length === 0
      ? "/invoice"
      : `/invoice/${parts.map((part) => encodeURIComponent(part)).join("/")}`

  return businessMetadata({
    metadata: content.metadata,
    path,
  })
}

export default function InvoiceSlugLayout({ children }: { children: ReactNode }) {
  return children
}
