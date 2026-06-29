import type { BusinessProfile } from "@/lib/use-business-profile"
import type { InvoicePdfIssuer } from "@/lib/invoices/issuer"

const SETTINGS_BUSINESS_HREF = "/settings?tab=business"

function nonEmpty(value: string | null | undefined): boolean {
  return Boolean(String(value ?? "").trim())
}

export type InvoiceBusinessReadiness = {
  ready: boolean
  message: string
  settingsHref: string
  missing: string[]
}

function buildReadiness(missing: string[]): InvoiceBusinessReadiness {
  if (missing.length === 0) {
    return { ready: true, message: "", settingsHref: SETTINGS_BUSINESS_HREF, missing: [] }
  }
  return {
    ready: false,
    settingsHref: SETTINGS_BUSINESS_HREF,
    missing,
    message:
      "Complete your business profile in Settings → Business before creating or sending invoices. Missing: " +
      missing.join(", ") +
      ".",
  }
}

/** Fields required on invoice PDF, email header, and customer-facing view. */
export function assessInvoiceBusinessReadiness(input: {
  name?: string | null
  addressLine1?: string | null
  city?: string | null
  country?: string | null
  supportEmail?: string | null
  invoiceReplyEmail?: string | null
}): InvoiceBusinessReadiness {
  const missing: string[] = []
  if (!nonEmpty(input.name)) missing.push("business name")
  if (!nonEmpty(input.invoiceReplyEmail) && !nonEmpty(input.supportEmail)) {
    missing.push("support email")
  }
  if (!nonEmpty(input.addressLine1)) missing.push("business address")
  if (!nonEmpty(input.city)) missing.push("city")
  if (!nonEmpty(input.country)) missing.push("country")
  return buildReadiness(missing)
}

export function assessInvoiceBusinessReadinessFromProfile(
  profile: Pick<
    BusinessProfile,
    | "name"
    | "addressLine1"
    | "city"
    | "country"
    | "supportEmail"
    | "invoiceReplyEmail"
  >,
): InvoiceBusinessReadiness {
  return assessInvoiceBusinessReadiness({
    name: profile.name,
    addressLine1: profile.addressLine1,
    city: profile.city,
    country: profile.country,
    supportEmail: profile.supportEmail,
    invoiceReplyEmail: profile.invoiceReplyEmail,
  })
}

export function assessInvoiceBusinessReadinessFromIssuer(
  issuer: InvoicePdfIssuer,
  invoiceReplyEmail: string | null,
): InvoiceBusinessReadiness {
  return assessInvoiceBusinessReadiness({
    name: issuer.name,
    addressLine1: issuer.address,
    city: issuer.city,
    country: issuer.country,
    supportEmail: issuer.email,
    invoiceReplyEmail,
  })
}
