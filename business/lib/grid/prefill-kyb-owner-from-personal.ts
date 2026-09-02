import { normalizeGridIsoDate, resolveGridKybOwnerIdType } from "@easner/shared"
import { resolveCountryIso2 } from "@/lib/countries"
import type { KybPersonRow } from "./kyb-application-store"

export type PersonalOwnerPrefill = {
  fullName: string
  email: string
  phone: string
  dateOfBirth: string
  residenceCountry: string
  kycAddressStreet: string
  kycAddressCity: string
  kycAddressState: string
  kycAddressPostCode: string
  kycAddressCountry: string
  kycIdType: string
  kycIdNumber: string
  kycIdIssuingCountry: string
}

export function splitPersonalFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") }
}

function fill(current: string, next: string): string {
  return current.trim() ? current : next.trim()
}

export function personalOwnerPrefillFromUserRow(row: Record<string, unknown> | null | undefined): PersonalOwnerPrefill {
  return {
    fullName: String(row?.full_name ?? "").trim(),
    email: String(row?.email ?? "").trim(),
    phone: String(row?.phone ?? "").trim(),
    dateOfBirth: normalizeGridIsoDate(String(row?.date_of_birth ?? "")),
    residenceCountry: String(row?.residence_country ?? "").trim(),
    kycAddressStreet: String(row?.kyc_address_street ?? "").trim(),
    kycAddressCity: String(row?.kyc_address_city ?? "").trim(),
    kycAddressState: String(row?.kyc_address_state ?? "").trim(),
    kycAddressPostCode: String(row?.kyc_address_post_code ?? "").trim(),
    kycAddressCountry: String(row?.kyc_address_country ?? "").trim(),
    kycIdType: String(row?.kyc_id_type ?? "").trim(),
    kycIdNumber: String(row?.kyc_id_number ?? "").trim(),
    kycIdIssuingCountry: String(row?.kyc_id_issuing_country ?? "").trim(),
  }
}

/** Fill empty KYB owner fields from the org owner's personal settings. */
export function mergeKybPersonFromPersonal(
  person: Pick<
    KybPersonRow,
    | "firstName"
    | "lastName"
    | "email"
    | "phone"
    | "birthDate"
    | "nationality"
    | "addressLine1"
    | "city"
    | "state"
    | "postalCode"
    | "addressCountry"
    | "idType"
    | "identifier"
    | "countryOfIssuance"
    | "roles"
    | "ownershipPercentage"
  >,
  personal: PersonalOwnerPrefill,
): Partial<KybPersonRow> {
  const { firstName, lastName } = splitPersonalFullName(personal.fullName)
  const issuance =
    resolveCountryIso2(personal.kycIdIssuingCountry) || resolveCountryIso2(personal.residenceCountry)
  const addressCountry =
    resolveCountryIso2(personal.kycAddressCountry) || resolveCountryIso2(person.addressCountry) || issuance
  const nationality =
    resolveCountryIso2(personal.residenceCountry) || resolveCountryIso2(person.nationality) || addressCountry
  const countryOfIssuance = fill(person.countryOfIssuance, issuance)
  const idType = resolveGridKybOwnerIdType({
    idType: fill(person.idType, personal.kycIdType),
    countryOfIssuance,
  })
  return {
    firstName: fill(person.firstName, firstName),
    lastName: fill(person.lastName, lastName),
    email: fill(person.email, personal.email),
    phone: fill(person.phone, personal.phone),
    birthDate: fill(person.birthDate, personal.dateOfBirth),
    nationality: fill(person.nationality, nationality),
    addressLine1: fill(person.addressLine1, personal.kycAddressStreet),
    city: fill(person.city, personal.kycAddressCity),
    state: fill(person.state, personal.kycAddressState),
    postalCode: fill(person.postalCode, personal.kycAddressPostCode),
    addressCountry: fill(person.addressCountry, addressCountry),
    idType,
    identifier: fill(person.identifier, personal.kycIdNumber),
    countryOfIssuance,
  }
}

export function emptyKybOwnerFromPersonal(personal: PersonalOwnerPrefill): Partial<KybPersonRow> {
  return {
    ...mergeKybPersonFromPersonal(
      {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        birthDate: "",
        nationality: "",
        addressLine1: "",
        city: "",
        state: "",
        postalCode: "",
        addressCountry: "",
        idType: "",
        identifier: "",
        countryOfIssuance: "",
        roles: ["UBO", "CONTROL_PERSON"],
        ownershipPercentage: 100,
      },
      personal,
    ),
    roles: ["UBO", "CONTROL_PERSON"],
    ownershipPercentage: 100,
  }
}

export function kybPersonNeedsPersonalPrefill(
  person: Pick<KybPersonRow, "firstName" | "lastName" | "email" | "phone" | "birthDate" | "addressLine1" | "identifier">,
  merged: Partial<KybPersonRow>,
): boolean {
  const keys = ["firstName", "lastName", "email", "phone", "birthDate", "addressLine1", "identifier"] as const
  return keys.some((key) => String(person[key] ?? "").trim() !== String(merged[key] ?? "").trim())
}
