import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { ensureBusinessOperationalAddressCountriesRegistered } from "@/lib/address/register-lib-address-countries"
import { countries, displayCountryFromBusinessSetting } from "@/lib/countries"
import type { BusinessProfile } from "@/lib/use-business-profile"
import { pickInvoiceReplyEmail, pickInvoiceReplyEmailWithSource } from "@/lib/invoices/invoice-reply-email"
import type { InvoiceReplyEmailSource } from "@/lib/invoices/invoice-reply-email"
import { formatOperationalAddressLines, formatAddressDisplayPart } from "@easner/shared/postal-address-form"
import { normalizeBusinessLogoUrl } from "@/lib/image-cache"

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
  countryCode: string
  addressLines: string[]
  email: string
  phone: string
  logoUrl?: string | null
}

const EMPTY_ISSUER: InvoicePdfIssuer = {
  name: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
  countryCode: "",
  addressLines: [],
  email: "",
  phone: "",
  logoUrl: null,
}

function countryCodeFromBusinessSetting(value: string | null | undefined): string {
  const raw = String(value ?? "").trim()
  if (!raw) return ""
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase()
  const match = countries.find((c) => c.name.toLowerCase() === raw.toLowerCase())
  return match?.code ?? ""
}

function buildIssuerAddressLines(input: {
  address: string
  city: string
  state: string
  zipCode: string
  country: string
  countryCode: string
}): string[] {
  const lines = formatOperationalAddressLines(
    {
      line1: input.address,
      city: input.city,
      state: input.state,
      postalCode: input.zipCode,
      countryCode: input.countryCode,
    },
    { appendCountry: true },
  )
  if (lines.length > 0) return lines

  const fallback: string[] = []
  if (input.address) fallback.push(formatAddressDisplayPart(input.address))
  const stateRaw = input.state.trim()
  const stateDisplay =
    stateRaw.length === 2 && stateRaw === stateRaw.toUpperCase()
      ? stateRaw
      : formatAddressDisplayPart(input.state)
  const locality = [formatAddressDisplayPart(input.city), stateDisplay].filter(Boolean).join(", ")
  const localityPostal = [locality, input.zipCode].filter(Boolean).join(" ")
  if (localityPostal) fallback.push(localityPostal)
  if (input.country) fallback.push(input.country)
  return fallback
}

function finalizeIssuer(input: Omit<InvoicePdfIssuer, "addressLines">): InvoicePdfIssuer {
  const addressLines = buildIssuerAddressLines(input)
  return { ...input, addressLines }
}

export function issuerFromBusinessProfile(profile: BusinessProfile): InvoicePdfIssuer {
  const country =
    displayCountryFromBusinessSetting(profile.country) ||
    displayCountryFromBusinessSetting(profile.countryCode) ||
    ""
  const countryCode =
    countryCodeFromBusinessSetting(profile.countryCode) ||
    countryCodeFromBusinessSetting(profile.country)
  return finalizeIssuer({
    name: profile.name?.trim() || "Business",
    address: profile.addressLine1?.trim() || "",
    city: profile.city?.trim() || "",
    state: profile.state?.trim() || "",
    zipCode: profile.postalCode?.trim() || "",
    country,
    countryCode,
    email: profile.supportEmail?.trim() || "",
    phone: profile.supportPhone?.trim() || "",
    logoUrl: profile.logoUrl,
  })
}

export async function fetchInvoiceIssuerForBusiness(
  admin: ReturnType<typeof createSupabaseAdmin>,
  businessId: string,
): Promise<InvoicePdfIssuer> {
  try {
    await ensureBusinessOperationalAddressCountriesRegistered()
  } catch (error) {
    console.warn("operational address country registration failed (non-fatal):", error)
  }

  const { data: org, error } = await admin
    .from("businesses")
    .select(
      "name,support_email,support_phone,address_line1,city,state,postal_code,country,logo_url",
    )
    .eq("id", businessId)
    .maybeSingle()

  if (error || !org) return { ...EMPTY_ISSUER, name: "Business" }

  const countryRaw = (org.country as string | null)?.trim() || ""
  const countryCode = countryCodeFromBusinessSetting(countryRaw)
  return finalizeIssuer({
    name: (org.name as string | null)?.trim() || "Business",
    address: (org.address_line1 as string | null)?.trim() || "",
    city: (org.city as string | null)?.trim() || "",
    state: (org.state as string | null)?.trim() || "",
    zipCode: (org.postal_code as string | null)?.trim() || "",
    country: displayCountryFromBusinessSetting(countryRaw || null) || "",
    countryCode,
    email: (org.support_email as string | null)?.trim() || "",
    phone: (org.support_phone as string | null)?.trim() || "",
    logoUrl: normalizeBusinessLogoUrl(org.logo_url),
  })
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
