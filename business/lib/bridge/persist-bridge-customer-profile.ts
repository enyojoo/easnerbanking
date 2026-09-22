import type { SupabaseClient } from "@supabase/supabase-js"
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

  if (isBusiness && businessId) {
    await writeRow(
      admin,
      "businesses",
      businessId,
      "name,description,website,tax_id,registration_number,country,registration_country,address_line1,city,state,postal_code,registered_address_line1,registered_address_city,registered_address_state,registered_address_postal_code,kyb_verified_at",
      parseBridgeCustomerForBusiness(input.customer, { approved, occurredAt }),
    )
  }

  if (!userId) return

  let ownerEmail: string | null = null
  if (isBusiness) {
    const { data } = await admin.from("users").select("email").eq("id", userId).maybeSingle()
    ownerEmail = typeof data?.email === "string" ? data.email : null
  }

  const person = isBusiness
    ? parseBridgeAssociatedPersonForUsers(input.customer, { ownerEmail, approved, occurredAt })
    : parseBridgeCustomerForUsers(input.customer, { approved, occurredAt })

  await writeRow(
    admin,
    "users",
    userId,
    "full_name,date_of_birth,phone,kyc_id_type,kyc_id_number,kyc_id_issuing_country,kyc_address_street,kyc_address_city,kyc_address_state,kyc_address_post_code,kyc_address_country,kyc_verified_at",
    person,
  )
}
