import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { displayCountryFromBusinessSetting } from "@/lib/countries"
import type { BusinessProfile } from "@/lib/use-business-profile"
import { pickInvoiceReplyEmail, pickInvoiceReplyEmailWithSource } from "@/lib/invoices/invoice-reply-email"
import type { InvoiceReplyEmailSource } from "@/lib/invoices/invoice-reply-email"

export { pickInvoiceReplyEmail, pickInvoiceReplyEmailWithSource } from "@/lib/invoices/invoice-reply-email"
export type { InvoiceReplyEmailSource } from "@/lib/invoices/invoice-reply-email"

/** Header block for invoice PDF + customer-facing invoice HTML (matches `InvoicePDFDocument` fields). */
export type InvoicePdfIssuer = {
  name: string
  address: string
  city: string
  state: string
  zipCode: string
  country: string
  email: string
  phone: string
}

const EMPTY_ISSUER: InvoicePdfIssuer = {
  name: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
  email: "",
  phone: "",
}

export function issuerFromBusinessProfile(profile: BusinessProfile): InvoicePdfIssuer {
  const country =
    displayCountryFromBusinessSetting(profile.country) ||
    displayCountryFromBusinessSetting(profile.countryCode) ||
    ""
  return {
    name: profile.name?.trim() || "Business",
    address: profile.addressLine1?.trim() || "",
    city: profile.city?.trim() || "",
    state: profile.state?.trim() || "",
    zipCode: profile.postalCode?.trim() || "",
    country,
    email: profile.supportEmail?.trim() || "",
    phone: profile.supportPhone?.trim() || "",
  }
}

export async function fetchInvoiceIssuerForBusiness(
  admin: ReturnType<typeof createSupabaseAdmin>,
  businessId: string,
): Promise<InvoicePdfIssuer> {
  const { data: org, error } = await admin
    .from("businesses")
    .select(
      "name,support_email,support_phone,address_line1,city,state,postal_code,country",
    )
    .eq("id", businessId)
    .maybeSingle()

  if (error || !org) return { ...EMPTY_ISSUER, name: "Business" }

  const countryRaw = (org.country as string | null)?.trim() || ""
  return {
    name: (org.name as string | null)?.trim() || "Business",
    address: (org.address_line1 as string | null)?.trim() || "",
    city: (org.city as string | null)?.trim() || "",
    state: (org.state as string | null)?.trim() || "",
    zipCode: (org.postal_code as string | null)?.trim() || "",
    country: displayCountryFromBusinessSetting(countryRaw || null) || "",
    email: (org.support_email as string | null)?.trim() || "",
    phone: (org.support_phone as string | null)?.trim() || "",
  }
}

/**
 * Reply-To for invoice emails to customers: org support email (Settings → Business),
 * then org owner, then the user sending the invoice.
 */
export async function resolveInvoiceReplyEmail(
  admin: ReturnType<typeof createSupabaseAdmin>,
  businessId: string,
  senderUserId: string,
): Promise<string | null> {
  const issuer = await fetchInvoiceIssuerForBusiness(admin, businessId)

  const { resolveOrgOwnerUserId } = await import("@/lib/business/org-owner")
  const ownerUserId = await resolveOrgOwnerUserId(admin, businessId, senderUserId)

  let ownerEmail: string | null = null
  let senderEmail: string | null = null

  for (const [userId, slot] of [
    [ownerUserId, "owner"],
    [senderUserId, "sender"],
  ] as const) {
    const { data } = await admin.from("users").select("email").eq("id", userId).maybeSingle()
    const email = (data?.email as string | null | undefined)?.trim() || null
    if (slot === "owner") ownerEmail = email
    else senderEmail = email
  }

  return pickInvoiceReplyEmail({
    supportEmail: issuer.email,
    ownerEmail,
    senderEmail,
  })
}

/** Same resolution as send-email, with source label for Settings / Invoices UI. */
export async function resolveInvoiceReplyEmailWithSource(
  admin: ReturnType<typeof createSupabaseAdmin>,
  businessId: string,
  senderUserId: string,
): Promise<{ email: string; source: InvoiceReplyEmailSource } | null> {
  const issuer = await fetchInvoiceIssuerForBusiness(admin, businessId)

  const { resolveOrgOwnerUserId } = await import("@/lib/business/org-owner")
  const ownerUserId = await resolveOrgOwnerUserId(admin, businessId, senderUserId)

  let ownerEmail: string | null = null
  let senderEmail: string | null = null

  for (const [userId, slot] of [
    [ownerUserId, "owner"],
    [senderUserId, "sender"],
  ] as const) {
    const { data } = await admin.from("users").select("email").eq("id", userId).maybeSingle()
    const email = (data?.email as string | null | undefined)?.trim() || null
    if (slot === "owner") ownerEmail = email
    else senderEmail = email
  }

  return pickInvoiceReplyEmailWithSource({
    supportEmail: issuer.email,
    ownerEmail,
    senderEmail,
  })
}
