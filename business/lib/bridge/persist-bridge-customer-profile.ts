import type { SupabaseClient } from "@supabase/supabase-js"
import { getBridgeAssociatedPerson, listBridgeAssociatedPersons } from "./kyc-links"
import { mergeBridgeCustomerRecords } from "./merge-bridge-customer-profile"
import {
  parseBridgeAssociatedPersonForUsers,
  parseBridgeCustomerForBusiness,
  parseBridgeCustomerForUsers,
  type ParsedBridgeCustomerForBusiness,
  type ParsedBridgeCustomerForUsers,
} from "./parse-bridge-customer-profile"

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === ""
}

function fillEmpty<T extends Record<string, unknown>>(
  existing: Record<string, unknown> | null,
  patch: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || String(value).trim() === "") continue
    if (!isBlank(existing?.[key])) continue
    out[key] = value
  }
  return out
}

async function writeRow(
  admin: SupabaseClient,
  table: "users" | "businesses",
  id: string,
  columns: string,
  patch: ParsedBridgeCustomerForUsers | ParsedBridgeCustomerForBusiness,
): Promise<void> {
  if (!id || Object.keys(patch).length === 0) return
  const { data } = await admin.from(table).select(columns).eq("id", id).maybeSingle()
  const next = fillEmpty((data as Record<string, unknown> | null) ?? null, patch)
  if (Object.keys(next).length === 0) return
  await admin
    .from(table)
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq("id", id)
}

function filled(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null && value !== false
}

function personNeedsDetail(person: Record<string, unknown>): boolean {
  const hasName = filled(person.first_name) || filled(person.last_name) || filled(person.full_name)
  const hasDob = filled(person.birth_date) || filled(person.date_of_birth)
  const address = person.residential_address ?? person.address
  const addressRecord =
    address && typeof address === "object" ? (address as Record<string, unknown>) : null
  const hasAddress = Boolean(
    addressRecord &&
      (filled(addressRecord.street_line_1) ||
        filled(addressRecord.city) ||
        filled(addressRecord.country)),
  )
  const docs = person.identifying_information ?? person.identifyingInformation
  const hasId = Array.isArray(docs) && docs.length > 0
  return !(hasName && hasDob && hasAddress && hasId)
}

/** Customer list embeds `{id, email}`. The person resource is what carries name, DOB, address, and ID. */
async function withAssociatedPersonDetails(
  customer: Record<string, unknown>,
  business: boolean,
): Promise<Record<string, unknown>> {
  const customerId = String(customer.id ?? "").trim()
  if (!customerId) return customer
  const embedded = customer.associated_persons ?? customer.associatedPersons
  let people = Array.isArray(embedded)
    ? embedded.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    : null
  if (!people && business) {
    people = await listBridgeAssociatedPersons(customerId).catch(() => [])
  }
  if (!people?.length) return customer

  const hydrated = []
  for (const person of people) {
    const personId = String(person.id ?? "").trim()
    if (!personId || !personNeedsDetail(person)) {
      hydrated.push(person)
      continue
    }
    try {
      const detail = await getBridgeAssociatedPerson(customerId, personId)
      hydrated.push(mergeBridgeCustomerRecords(detail, person))
    } catch {
      hydrated.push(person)
    }
  }
  return { ...customer, associated_persons: hydrated }
}

/**
 * Copy Bridge customer identity into the same columns Noah and Grid already fill.
 * Only blank columns are written, so an existing Noah or edited profile is left in place.
 */
export async function persistBridgeCustomerProfile(
  admin: SupabaseClient,
  input: {
    customer: Record<string, unknown>
    status: string
    userId?: string | null
    businessId?: string | null
  },
): Promise<void> {
  const approved = String(input.status ?? "").trim().toLowerCase() === "approved"
  const occurredAt = new Date().toISOString()
  const userId = String(input.userId ?? "").trim()
  const businessId = String(input.businessId ?? "").trim()
  const type = String(input.customer.type ?? "").trim().toLowerCase()
  const isBusiness = Boolean(businessId) || type === "business"
  const customer = isBusiness
    ? await withAssociatedPersonDetails(input.customer, true)
    : input.customer

  if (isBusiness && businessId) {
    await writeRow(
      admin,
      "businesses",
      businessId,
      "name,description,website,tax_id,registration_number,country,registration_country,address_line1,city,state,postal_code,registered_address_line1,registered_address_city,registered_address_state,registered_address_postal_code,kyb_verified_at",
      parseBridgeCustomerForBusiness(customer, { approved, occurredAt }),
    )
  }

  if (!userId) return

  let ownerEmail: string | null = null
  if (isBusiness) {
    const { data } = await admin.from("users").select("email").eq("id", userId).maybeSingle()
    ownerEmail = typeof data?.email === "string" ? data.email : null
  }

  const person = isBusiness
    ? parseBridgeAssociatedPersonForUsers(customer, { ownerEmail, approved, occurredAt })
    : parseBridgeCustomerForUsers(customer, { approved, occurredAt })

  await writeRow(
    admin,
    "users",
    userId,
    "full_name,date_of_birth,phone,kyc_id_type,kyc_id_number,kyc_id_issuing_country,kyc_address_street,kyc_address_city,kyc_address_state,kyc_address_post_code,kyc_address_country,kyc_verified_at",
    person,
  )
}
