import type { BusinessProfile } from "@/lib/use-business-profile"
import {
  getOperationalAddressMissingLabels,
  isOperationalAddressComplete,
  isOperationalAddressCountryRegistered,
} from "@easner/shared/postal-address-form"
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
  state?: string | null
  postalCode?: string | null
  country?: string | null
  countryCode?: string | null
  supportEmail?: string | null
  invoiceReplyEmail?: string | null
}): InvoiceBusinessReadiness {
  const missing: string[] = []
  if (!nonEmpty(input.name)) missing.push("business name")
  if (!nonEmpty(input.invoiceReplyEmail) && !nonEmpty(input.supportEmail)) {
    missing.push("support email")
  }
  const countryCode = String(input.countryCode ?? "").trim().toUpperCase()
  const addressParts = {
    line1: input.addressLine1,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    countryCode,
  }

  if (!nonEmpty(input.country)) missing.push("country")

  if (!countryCode) {
    if (!nonEmpty(input.addressLine1)) missing.push("business address")
    if (!nonEmpty(input.city)) missing.push("city")
  } else if (!isOperationalAddressCountryRegistered(countryCode)) {
    if (!nonEmpty(input.addressLine1)) missing.push("business address")
    if (!nonEmpty(input.city)) missing.push("city")
    if (!nonEmpty(input.state)) missing.push("state")
    if (!nonEmpty(input.postalCode)) missing.push("postal code")
  } else if (!isOperationalAddressComplete(countryCode, addressParts)) {
    missing.push(...getOperationalAddressMissingLabels(countryCode, addressParts))
  }

  return buildReadiness([...new Set(missing)])
}

export function assessInvoiceBusinessReadinessFromProfile(
  profile: Pick<
    BusinessProfile,
    | "name"
    | "addressLine1"
    | "city"
    | "state"
    | "postalCode"
    | "country"
    | "countryCode"
    | "supportEmail"
    | "invoiceReplyEmail"
  >,
): InvoiceBusinessReadiness {
  return assessInvoiceBusinessReadiness({
    name: profile.name,
    addressLine1: profile.addressLine1,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    country: profile.country,
    countryCode: profile.countryCode,
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
    state: issuer.state,
    postalCode: issuer.zipCode,
    country: issuer.country,
    countryCode: issuer.countryCode,
    supportEmail: issuer.email,
    invoiceReplyEmail,
  })
}
