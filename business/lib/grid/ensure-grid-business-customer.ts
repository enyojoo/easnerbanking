import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { gridFetch, GridHttpError } from "./http"
import {
  buildGridBusinessCustomerPayload,
  type GridBusinessProfile,
} from "./business-kyc-metadata"
import { buildGridBusinessProfileShell } from "./business-profile-shell"
import { gridPlatformCustomerIdFromBusinessId } from "./customer-id"
import { normalizeGridCustomerId } from "./quote-request"
import type { GridCustomer } from "./types"

export type { GridBusinessProfile } from "./business-kyc-metadata"

async function readStoredGridCustomerId(
  admin: SupabaseClient,
  businessId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("businesses")
    .select("grid_customer_id")
    .eq("id", businessId)
    .maybeSingle()
  return String(data?.grid_customer_id ?? "").trim() || null
}

async function persistGridCustomerId(
  admin: SupabaseClient,
  businessId: string,
  customerId: string,
): Promise<void> {
  await admin
    .from("businesses")
    .update({ grid_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("id", businessId)
}

async function verifyGridCustomerExists(customerId: string): Promise<boolean> {
  try {
    await gridFetch({ method: "GET", path: `/customers/${encodeURIComponent(customerId)}` })
    return true
  } catch (e) {
    if (e instanceof GridHttpError && e.status === 404) return false
    throw e
  }
}

async function findGridCustomerByPlatformId(platformCustomerId: string): Promise<GridCustomer | null> {
  const qs = new URLSearchParams({ platformCustomerId })
  const res = await gridFetch<{ data?: GridCustomer[] }>({
    method: "GET",
    path: `/customers?${qs.toString()}`,
  })
  const row = (res.data ?? [])[0]
  return row?.id ? row : null
}

export async function loadGridBusinessProfile(
  admin: SupabaseClient,
  businessId: string,
): Promise<GridBusinessProfile | null> {
  const { data } = await admin
    .from("businesses")
    .select(
      "name,easetag,registration_number,tax_id,country,address_line1,city,state,postal_code,support_email,created_at",
    )
    .eq("id", businessId)
    .maybeSingle()
  if (!data) return null
  return buildGridBusinessProfileShell({
    name: data.name,
    easetag: data.easetag,
    registrationNumber: data.registration_number,
    taxId: data.tax_id,
    country: data.country,
    addressLine1: data.address_line1,
    city: data.city,
    state: data.state,
    postalCode: data.postal_code,
    email: data.support_email,
    createdAt: data.created_at,
  })
}

async function withGridBusinessContactEmail(
  admin: SupabaseClient,
  businessId: string,
  userId: string,
  profile: GridBusinessProfile,
): Promise<GridBusinessProfile> {
  if (profile.email?.trim()) return profile

  const ownerId = await resolveOrgOwnerUserId(admin, businessId, userId)
  const userIds = [...new Set([ownerId, userId].filter(Boolean))]
  const { data: users } = await admin.from("users").select("id,email").in("id", userIds)
  const emailById = new Map(
    (users ?? []).map((row) => [String(row.id), String(row.email ?? "").trim()]),
  )
  const email = emailById.get(ownerId) || emailById.get(userId) || ""
  if (!email) {
    throw new Error("A contact email is required to start business verification")
  }
  return { ...profile, email }
}

/** Ensure a Grid BUSINESS customer exists for the org. */
export async function ensureGridBusinessCustomer(input: {
  admin: SupabaseClient
  userId: string
  businessId: string
  profile?: GridBusinessProfile
}): Promise<{ customerId: string; platformCustomerId: string; customer: GridCustomer }> {
  const platformCustomerId = gridPlatformCustomerIdFromBusinessId(input.businessId)
  const rawProfile =
    input.profile ?? (await loadGridBusinessProfile(input.admin, input.businessId))
  if (!rawProfile) {
    throw new Error("Business organization not found")
  }
  const profile = await withGridBusinessContactEmail(
    input.admin,
    input.businessId,
    input.userId,
    rawProfile,
  )

  const stored = await readStoredGridCustomerId(input.admin, input.businessId)
  if (stored) {
    const customerId = normalizeGridCustomerId(stored)
    if (await verifyGridCustomerExists(customerId)) {
      const customer = await gridFetch<GridCustomer>({
        method: "GET",
        path: `/customers/${encodeURIComponent(customerId)}`,
      })
      if (customerId !== stored) {
        await persistGridCustomerId(input.admin, input.businessId, customerId)
      }
      return { customerId, platformCustomerId, customer }
    }
  }

  const existing = await findGridCustomerByPlatformId(platformCustomerId).catch(() => null)
  if (existing?.id) {
    const customerId = normalizeGridCustomerId(existing.id)
    await persistGridCustomerId(input.admin, input.businessId, customerId)
    return { customerId, platformCustomerId, customer: existing }
  }

  const payload = buildGridBusinessCustomerPayload({ platformCustomerId, profile })
  const created = await gridFetch<GridCustomer>({
    method: "POST",
    path: "/customers",
    json: payload,
    idempotencyKey: platformCustomerId,
  })

  const customerId = normalizeGridCustomerId(String(created.id ?? ""))
  if (!customerId) throw new Error("Grid BUSINESS customer create did not return id")
  await persistGridCustomerId(input.admin, input.businessId, customerId)
  return { customerId, platformCustomerId, customer: created }
}
