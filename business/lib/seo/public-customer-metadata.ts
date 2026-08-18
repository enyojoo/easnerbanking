import { normalizeEasetag } from "@/lib/easetag-validation"
import { fetchInvoiceIssuerForBusiness } from "@/lib/invoices/issuer"
import {
  getInvoiceAppPublicOrigin,
  getPayAppPublicOrigin,
} from "@/lib/customer-hosts"
import {
  resolveCustomerPublicKind,
  type CustomerPublicKind,
} from "@/lib/customer-public-path"
import { resolvePublicPayPath } from "@/lib/payment-links/resolve-public-path"
import { invoicePublicMetadata, invoiceSeo } from "@/lib/seo/content/invoice"
import { paymentLinkPublicMetadata, payCustomerSeo } from "@/lib/seo/content/pay-customer"
import type { BusinessMetadataInput } from "@/lib/seo/metadata"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export type PublicCustomerOg = {
  headline: string | string[]
  subhead: string
  alt: string
}

export type PublicCustomerSeo = {
  metadataInput: BusinessMetadataInput
  og: PublicCustomerOg
}

function publicPath(parts: string[]): string {
  const encoded = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
  return encoded.length > 0 ? `/${encoded.join("/")}` : "/"
}

export const publicCustomerOgImagePath = {
  pay: "/og/pay/opengraph-image",
  invoice: "/og/invoice/opengraph-image",
  thanks: "/og/pay/thanks/opengraph-image",
} as const

function ogImageFor(
  kind: CustomerPublicKind | "pay_default",
  parts: string[],
  alt: string,
): { url: string; alt: string } {
  if (kind === "pay_thanks") {
    return { url: publicCustomerOgImagePath.thanks, alt }
  }
  const path = publicPath(parts)
  return {
    url: path === "/" ? "/og/customer" : `/og/customer${path}`,
    alt,
  }
}

function seoFromContent(content: {
  metadata: BusinessMetadataInput["metadata"]
  hero: { h1: string; subhead: string; altText: string }
  ogHeadline?: string | readonly string[]
}): { metadata: BusinessMetadataInput["metadata"]; og: PublicCustomerOg } {
  return {
    metadata: content.metadata,
    og: {
      headline: content.ogHeadline ? [...content.ogHeadline] : content.hero.h1,
      subhead: content.hero.subhead,
      alt: content.hero.altText,
    },
  }
}

async function resolvePayBusinessName(parts: string[]): Promise<string | null> {
  try {
    const admin = createSupabaseAdmin()
    const resolved = await resolvePublicPayPath(admin, parts)
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

async function resolveInvoiceBusinessName(parts: string[]): Promise<string | null> {
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

    if (!businessId) return null
    const issuer = await fetchInvoiceIssuerForBusiness(admin, businessId)
    return issuer.name?.trim() || null
  } catch {
    return null
  }
}

export async function resolvePublicCustomerSeo(input: {
  hostname: string | null | undefined
  parts: string[]
  forceKind?: CustomerPublicKind
}): Promise<PublicCustomerSeo> {
  const parts = input.parts.map((part) => part.trim()).filter(Boolean)
  const kind = input.forceKind ?? resolveCustomerPublicKind(input.hostname, parts)
  const path = publicPath(parts)

  if (kind === "pay_thanks") {
    const { metadata, og } = seoFromContent(payCustomerSeo.thanks)
    return {
      metadataInput: {
        metadata,
        path,
        metadataBase: getPayAppPublicOrigin(),
        ogImage: ogImageFor(kind, parts, og.alt),
      },
      og,
    }
  }

  if (kind === "invoice") {
    const name = await resolveInvoiceBusinessName(parts)
    const { metadata, og } = seoFromContent(
      name ? invoicePublicMetadata(name) : invoiceSeo.publicDefault,
    )
    return {
      metadataInput: {
        metadata,
        path,
        metadataBase: getInvoiceAppPublicOrigin(),
        ogImage: ogImageFor(kind, parts, og.alt),
      },
      og,
    }
  }

  const name = kind === "pay" ? await resolvePayBusinessName(parts) : null
  const { metadata, og } = seoFromContent(
    name ? paymentLinkPublicMetadata(name) : payCustomerSeo.publicDefault,
  )
  return {
    metadataInput: {
      metadata,
      path,
      metadataBase: getPayAppPublicOrigin(),
      ogImage: ogImageFor(kind ?? "pay_default", parts, og.alt),
    },
    og,
  }
}
