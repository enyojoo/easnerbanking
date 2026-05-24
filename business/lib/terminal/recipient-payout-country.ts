import { resolvePayoutCountryCode } from "@easner/shared"

export type RecipientCountryRow = {
  country_code?: string | null
  currency: string
}

/** Infer ISO2 country for Noah sell/prepare when recipients omit country_code. */
export function resolveRecipientPayoutCountry(row: RecipientCountryRow): string {
  return resolvePayoutCountryCode({
    countryCode: row.country_code,
    currencyCode: row.currency,
  })
}
