import type { SupabaseClient } from "@supabase/supabase-js"
import { gridFetch, GridHttpError } from "./http"
import { buildGridIndividualCustomerPayload, type GridPersonProfile } from "./kyc-metadata"
export type { GridPersonProfile } from "./kyc-metadata"
import {
  gridPlatformCustomerIdForSubject,
  gridPlatformCustomerIdFromBusinessId,
  gridPlatformCustomerIdFromUserId,
} from "./customer-id"
import { normalizeGridCustomerId } from "./quote-request"
import type { GridCustomer } from "./types"

async function readStoredGridCustomerId(
  admin: SupabaseClient,
  input: { userId: string; businessId?: string | null; scope?: "individual" | "business" },
): Promise<string | null> {
  if (input.scope === "business" && input.businessId) {
    const { data } = await admin
      .from("businesses")
      .select("grid_customer_id")
      .eq("id", input.businessId)
      .maybeSingle()
    return String(data?.grid_customer_id ?? "").trim() || null
  }
  const { data } = await admin
    .from("users")
    .select("grid_customer_id")
    .eq("id", input.userId)
    .maybeSingle()
  return String(data?.grid_customer_id ?? "").trim() || null
}

async function persistGridCustomerId(
  admin: SupabaseClient,
  input: { userId: string; businessId?: string | null; scope?: "individual" | "business"; customerId: string },
): Promise<void> {
  const now = new Date().toISOString()
  if (input.scope === "business" && input.businessId) {
    await admin
      .from("businesses")
      .update({ grid_customer_id: input.customerId, updated_at: now })
      .eq("id", input.businessId)
    return
  }
  await admin
    .from("users")
    .update({ grid_customer_id: input.customerId, updated_at: now })
    .eq("id", input.userId)
}

async function clearStoredGridCustomerId(
  admin: SupabaseClient,
  input: { userId: string; businessId?: string | null; scope?: "individual" | "business" },
): Promise<void> {
  const now = new Date().toISOString()
  if (input.scope === "business" && input.businessId) {
    await admin
      .from("businesses")
      .update({ grid_customer_id: null, updated_at: now })
      .eq("id", input.businessId)
    return
  }
  await admin
    .from("users")
    .update({ grid_customer_id: null, updated_at: now })
    .eq("id", input.userId)
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

/**
 * Ensure a Grid customer exists for the Easner subject (BYO KYC from Noah profile).
 * Gates on caller having verified Noah KYC before money movement.
 */
export async function ensureGridCustomer(input: {
  admin: SupabaseClient
  userId: string
  businessId?: string | null
  scope?: "individual" | "business"
  profile: GridPersonProfile
}): Promise<{ customerId: string; platformCustomerId: string }> {
  const platformCustomerId = gridPlatformCustomerIdForSubject({
    userId: input.userId,
    businessId: input.businessId,
    scope: input.scope,
  })

  const stored = await readStoredGridCustomerId(input.admin, input)
  if (stored) {
    const customerId = normalizeGridCustomerId(stored)
    if (await verifyGridCustomerExists(customerId)) {
      if (customerId !== stored) {
        await persistGridCustomerId(input.admin, {
          userId: input.userId,
          businessId: input.businessId,
          scope: input.scope,
          customerId,
        })
      }
      return { customerId, platformCustomerId }
    }
    await clearStoredGridCustomerId(input.admin, input)
  }

  const existing = await findGridCustomerByPlatformId(platformCustomerId).catch(() => null)
  if (existing?.id) {
    const customerId = normalizeGridCustomerId(existing.id)
    await persistGridCustomerId(input.admin, {
      userId: input.userId,
      businessId: input.businessId,
      scope: input.scope,
      customerId,
    })
    return { customerId, platformCustomerId }
  }

  const payload = buildGridIndividualCustomerPayload({
    platformCustomerId,
    profile: input.profile,
  })

  const created = await gridFetch<GridCustomer>({
    method: "POST",
    path: "/customers",
    json: payload,
    idempotencyKey: platformCustomerId,
  })

  const customerId = normalizeGridCustomerId(String(created.id ?? ""))
  if (!customerId) {
    throw new Error("Grid customer create did not return id")
  }

  await persistGridCustomerId(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    scope: input.scope,
    customerId,
  })

  return { customerId, platformCustomerId }
}

export {
  gridPlatformCustomerIdForSubject,
  gridPlatformCustomerIdFromBusinessId,
  gridPlatformCustomerIdFromUserId,
}
