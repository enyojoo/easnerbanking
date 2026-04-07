import type { ReactNode } from "react"
import type { Metadata } from "next"
import { businessInfo } from "@/lib/business-info"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { fetchInvoiceIssuerForBusiness } from "@/lib/invoices/issuer"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  const parts = slug ?? []
  const fallbackName = businessInfo.name
  const titleFallback = `Invoice from ${fallbackName}`

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

    if (!businessId) {
      return { title: titleFallback, description: `View your invoice from ${fallbackName}` }
    }

    const issuer = await fetchInvoiceIssuerForBusiness(admin, businessId)
    const name = issuer.name?.trim() || fallbackName
    return {
      title: `Invoice from ${name}`,
      description: `View your invoice from ${name}`,
    }
  } catch {
    return { title: titleFallback, description: `View your invoice from ${fallbackName}` }
  }
}

export default function InvoiceViewSlugLayout({ children }: { children: ReactNode }) {
  return children
}
