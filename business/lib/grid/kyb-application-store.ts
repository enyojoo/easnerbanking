import type { SupabaseClient } from "@supabase/supabase-js"
import {
  emptyGridKybCompanyDraft,
  gridBeneficialOwnerIdFromResource,
  gridBeneficialOwnerIdsFromVerificationErrors,
  gridKybApplicationStatusFromVerification,
  normalizeGridKybIdType,
  resolveGridKybOwnerIdType,
  type GridKybApplicationStatus,
  type GridKybCompanyDraft,
  type GridKybVerificationError,
} from "@easner/shared"
import { decryptKybPii, encryptKybPii } from "./kyb-pii-crypto"

export { KYB_DOCUMENTS_BUCKET } from "./kyb-document-limits"

export type KybApplicationRow = {
  id: string
  business_id: string
  status: GridKybApplicationStatus
  company: GridKybCompanyDraft
  grid_customer_id: string | null
  grid_verification_id: string | null
  last_errors: GridKybVerificationError[]
  submitted_at: string | null
  last_synced_at: string | null
  updated_at: string | null
}

export type KybPersonRow = {
  id: string
  firstName: string
  middleName: string
  lastName: string
  email: string
  phone: string
  birthDate: string
  nationality: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  addressCountry: string
  ownershipPercentage: number | null
  roles: string[]
  idType: string
  identifier: string
  countryOfIssuance: string
  gridBeneficialOwnerId: string | null
  updatedAt: string | null
}

export type KybDocumentRow = {
  id: string
  personId: string | null
  category: string
  documentType: string
  issuingCountry: string
  issuingAuthority: string
  documentNumber: string
  storagePath: string
  fileName: string
  contentType: string
  byteSize: number | null
  side: string | null
  gridDocumentId: string | null
  updatedAt: string | null
}

function asCompany(value: unknown): GridKybCompanyDraft {
  const base = emptyGridKybCompanyDraft()
  if (!value || typeof value !== "object") return base
  const raw = value as Record<string, unknown>
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(base).map(([key, fallback]) => {
        const next = raw[key]
        if (Array.isArray(fallback)) {
          return [key, Array.isArray(next) ? next.map((row) => String(row)) : fallback]
        }
        return [key, next == null ? fallback : String(next)]
      }),
    ),
  } as GridKybCompanyDraft
}

function asErrors(value: unknown): GridKybVerificationError[] {
  return Array.isArray(value) ? (value as GridKybVerificationError[]) : []
}

export async function ensureKybApplication(
  admin: SupabaseClient,
  businessId: string,
): Promise<KybApplicationRow> {
  const { data: existing } = await admin
    .from("business_kyb_applications")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle()
  if (existing) {
    return {
      id: String(existing.id),
      business_id: String(existing.business_id),
      status: String(existing.status ?? "draft") as GridKybApplicationStatus,
      company: asCompany(existing.company),
      grid_customer_id: existing.grid_customer_id ? String(existing.grid_customer_id) : null,
      grid_verification_id: existing.grid_verification_id ? String(existing.grid_verification_id) : null,
      last_errors: asErrors(existing.last_errors),
      submitted_at: existing.submitted_at ? String(existing.submitted_at) : null,
      last_synced_at: existing.last_synced_at ? String(existing.last_synced_at) : null,
      updated_at: existing.updated_at ? String(existing.updated_at) : null,
    }
  }

  const { data: created, error } = await admin
    .from("business_kyb_applications")
    .insert({
      business_id: businessId,
      status: "draft",
      company: emptyGridKybCompanyDraft(),
    })
    .select("*")
    .single()
  if (error || !created) {
    throw new Error(error?.message || "Could not create KYB application")
  }
  return {
    id: String(created.id),
    business_id: String(created.business_id),
    status: "draft",
    company: asCompany(created.company),
    grid_customer_id: null,
    grid_verification_id: null,
    last_errors: [],
    submitted_at: null,
    last_synced_at: null,
    updated_at: created.updated_at ? String(created.updated_at) : null,
  }
}

export function mapKybPersonRow(row: Record<string, unknown>, includeIdentifier: boolean): KybPersonRow {
  return {
    id: String(row.id),
    firstName: String(row.first_name ?? ""),
    middleName: String(row.middle_name ?? ""),
    lastName: String(row.last_name ?? ""),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    birthDate: String(row.birth_date ?? ""),
    nationality: String(row.nationality ?? ""),
    addressLine1: String(row.address_line1 ?? ""),
    addressLine2: String(row.address_line2 ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    postalCode: String(row.postal_code ?? ""),
    addressCountry: String(row.address_country ?? ""),
    ownershipPercentage:
      row.ownership_percentage == null || row.ownership_percentage === ""
        ? null
        : Number(row.ownership_percentage),
    roles: Array.isArray(row.roles) ? row.roles.map((role) => String(role)) : [],
    idType: normalizeGridKybIdType(String(row.id_type ?? "")),
    identifier: includeIdentifier ? decryptKybPii(String(row.identifier_ciphertext ?? "")) : "",
    countryOfIssuance: String(row.country_of_issuance ?? ""),
    gridBeneficialOwnerId: row.grid_beneficial_owner_id ? String(row.grid_beneficial_owner_id) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }
}

export function mapKybDocumentRow(row: Record<string, unknown>, includeNumber: boolean): KybDocumentRow {
  return {
    id: String(row.id),
    personId: row.person_id ? String(row.person_id) : null,
    category: String(row.category ?? ""),
    documentType: String(row.document_type ?? ""),
    issuingCountry: String(row.issuing_country ?? ""),
    issuingAuthority: String(row.issuing_authority ?? ""),
    documentNumber: includeNumber ? decryptKybPii(String(row.document_number_ciphertext ?? "")) : "",
    storagePath: String(row.storage_path ?? ""),
    fileName: String(row.file_name ?? ""),
    contentType: String(row.content_type ?? ""),
    byteSize: row.byte_size == null ? null : Number(row.byte_size),
    side: row.side ? String(row.side) : null,
    gridDocumentId: row.grid_document_id ? String(row.grid_document_id) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }
}

/** Attach a leftover Grid owner id onto the sole local person so ID uploads resolve. */
export async function linkKybPeopleToGridOwnerErrors(
  admin: SupabaseClient,
  people: KybPersonRow[],
  errors: GridKybVerificationError[] | null | undefined,
): Promise<KybPersonRow[]> {
  const ownerIds = gridBeneficialOwnerIdsFromVerificationErrors(errors)
  if (ownerIds.length !== 1 || people.length !== 1) return people
  const person = people[0]
  const current = gridBeneficialOwnerIdFromResource(person.gridBeneficialOwnerId)
  if (current === ownerIds[0]) return people
  await admin
    .from("business_kyb_people")
    .update({
      grid_beneficial_owner_id: ownerIds[0],
      updated_at: new Date().toISOString(),
    })
    .eq("id", person.id)
  return [{ ...person, gridBeneficialOwnerId: ownerIds[0] }]
}

export async function listKybPeople(
  admin: SupabaseClient,
  applicationId: string,
  includeIdentifier: boolean,
): Promise<KybPersonRow[]> {
  const { data } = await admin
    .from("business_kyb_people")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true })
  return (data ?? []).map((row) => mapKybPersonRow(row as Record<string, unknown>, includeIdentifier))
}

export async function listKybDocuments(
  admin: SupabaseClient,
  applicationId: string,
  includeNumber: boolean,
): Promise<KybDocumentRow[]> {
  const { data } = await admin
    .from("business_kyb_documents")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true })
  return (data ?? []).map((row) => mapKybDocumentRow(row as Record<string, unknown>, includeNumber))
}

export function personWritePayload(input: {
  applicationId: string
  businessId: string
  person: Partial<KybPersonRow> & { firstName?: string; lastName?: string; id_type?: string | null }
}) {
  const identifier = encryptKybPii(input.person.identifier)
  const nationality = String(input.person.nationality ?? "").trim()
  const addressCountry = String(input.person.addressCountry ?? "").trim()
  const countryOfIssuance = String(input.person.countryOfIssuance ?? "").trim()
  const idType =
    resolveGridKybOwnerIdType({
      idType: input.person.idType ?? input.person.id_type,
      countryOfIssuance,
    }) || null
  return {
    application_id: input.applicationId,
    business_id: input.businessId,
    first_name: String(input.person.firstName ?? "").trim(),
    middle_name: String(input.person.middleName ?? "").trim() || null,
    last_name: String(input.person.lastName ?? "").trim(),
    email: String(input.person.email ?? "").trim() || null,
    phone: String(input.person.phone ?? "").trim() || null,
    birth_date: String(input.person.birthDate ?? "").trim() || null,
    nationality: nationality || null,
    address_line1: String(input.person.addressLine1 ?? "").trim() || null,
    address_line2: String(input.person.addressLine2 ?? "").trim() || null,
    city: String(input.person.city ?? "").trim() || null,
    state: String(input.person.state ?? "").trim() || null,
    postal_code: String(input.person.postalCode ?? "").trim() || null,
    address_country: addressCountry || null,
    ownership_percentage: input.person.ownershipPercentage ?? null,
    roles: Array.isArray(input.person.roles) ? input.person.roles : [],
    id_type: idType,
    identifier_ciphertext: identifier.ciphertext,
    identifier_key_id: identifier.keyId,
    country_of_issuance: countryOfIssuance || null,
    updated_at: new Date().toISOString(),
  }
}

export async function persistKybApplicationFromGrid(input: {
  admin: SupabaseClient
  businessId: string
  gridCustomerId: string
  verificationStatus?: string | null
  localStatus?: string | null
  verificationId?: string | null
  errors?: GridKybVerificationError[] | null
}): Promise<void> {
  const application = await ensureKybApplication(input.admin, input.businessId)
  const inferred = gridKybApplicationStatusFromVerification({
    verificationStatus: input.verificationStatus,
    localStatus: input.localStatus,
  })
  const hasVerification = Boolean(input.verificationStatus || input.verificationId)
  const status =
    application.status === "draft" && !hasVerification && inferred !== "approved" && inferred !== "rejected"
      ? "draft"
      : inferred
  const now = new Date().toISOString()
  // Do not stamp updated_at here. Polls used to set it equal to last_synced_at,
  // which made complete skip PATCHing company fields Grid still did not have.
  await input.admin
    .from("business_kyb_applications")
    .update({
      status,
      grid_customer_id: input.gridCustomerId,
      grid_verification_id: input.verificationId ?? application.grid_verification_id,
      last_errors: Array.isArray(input.errors) ? input.errors : application.last_errors,
      last_synced_at: now,
      submitted_at:
        status === "draft" || status === "resolve_errors"
          ? application.submitted_at
          : application.submitted_at ?? now,
    })
    .eq("id", application.id)
}
