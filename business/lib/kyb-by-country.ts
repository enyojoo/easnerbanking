/**
 * KYB (Know Your Business) field requirements by country.
 * Maps to `businesses.registration_number` and `businesses.tax_id`.
 *
 * - Two fields when registries and tax authorities issue separate IDs (US, UK, NG, most countries).
 * - One field when a single national identifier covers both (Estonia registrikood, Canada BN).
 */
export interface KybField {
  id: "registrationNumber" | "taxId"
  label: string
  placeholder?: string
}

export type KybFieldId = KybField["id"]

const registrationNumber = (
  label: string,
  placeholder?: string,
): KybField => ({
  id: "registrationNumber",
  label,
  placeholder,
})

const taxId = (label: string, placeholder?: string): KybField => ({
  id: "taxId",
  label,
  placeholder,
})

/** Registration + separate tax ID (default for most jurisdictions). */
const REGISTRATION_AND_TAX: KybField[] = [
  registrationNumber("Business registration number", "From company registry"),
  taxId("Tax ID / VAT number", "National tax or VAT identifier"),
]

export const KYB_BY_COUNTRY: Record<string, KybField[]> = {
  US: [
    registrationNumber("Registration number", "State registry filing number"),
    taxId("EIN (Employer Identification Number)", "12-3456789"),
  ],
  GB: [
    registrationNumber("Companies House registration number", "e.g. 12345678"),
    taxId("VAT number", "e.g. GB123456789"),
  ],
  NG: [
    registrationNumber("CAC registration number (RC number)", "From Corporate Affairs Commission"),
    taxId("Tax Identification Number (TIN)", "From FIRS"),
  ],
  /** Registry code is the canonical business identifier for both registry and tax in Estonia. */
  EE: [
    registrationNumber("Registry code (registrikood)", "8-digit code from e-Business Register"),
  ],
  /** CRA Business Number is used across registry and tax programs. */
  CA: [
    registrationNumber("Business Number (BN)", "9-digit CRA identifier"),
  ],
}

/** Default when country is not explicitly listed. */
export const KYB_DEFAULT: KybField[] = REGISTRATION_AND_TAX

export function getKybFields(countryCode: string): KybField[] {
  const code = countryCode.trim().toUpperCase()
  return KYB_BY_COUNTRY[code] ?? KYB_DEFAULT
}

/** Read a KYB form value from business profile fields. */
export function kybFieldValue(
  fieldId: KybFieldId,
  profile: { registrationNumber?: string | null; taxId?: string | null },
): string {
  if (fieldId === "taxId") return String(profile.taxId ?? "").trim()
  return String(profile.registrationNumber ?? "").trim()
}
