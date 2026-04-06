import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { BusinessProfile } from "@/lib/use-business-profile"

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
  return {
    name: profile.name?.trim() || "Business",
    address: profile.addressLine1?.trim() || "",
    city: profile.city?.trim() || "",
    state: profile.state?.trim() || "",
    zipCode: profile.postalCode?.trim() || "",
    country: profile.country?.trim() || "",
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

  return {
    name: (org.name as string | null)?.trim() || "Business",
    address: (org.address_line1 as string | null)?.trim() || "",
    city: (org.city as string | null)?.trim() || "",
    state: (org.state as string | null)?.trim() || "",
    zipCode: (org.postal_code as string | null)?.trim() || "",
    country: (org.country as string | null)?.trim() || "",
    email: (org.support_email as string | null)?.trim() || "",
    phone: (org.support_phone as string | null)?.trim() || "",
  }
}
