import type { SupabaseClient } from "@supabase/supabase-js"
import { gridFetch, GridHttpError } from "./http"
import { buildGridIndividualCustomerPayload, type GridPersonProfile } from "./kyc-metadata"
export type { GridPersonProfile } from "./kyc-metadata"
import {
  gridPlatformCustomerIdForSubject,
  gridPlatformCustomerIdFromBusinessId,
  gridPlatformCustomerIdFromUserId,
} from "./customer-id"
import {
  customerNeedsEndUserTermsConsentPatch,
  loadGridEndUserTermsConsentForUser,
  markGridEndUserTermsSynced,
  type GridEndUserTermsConsentPayload,
} from "./end-user-terms-consent"
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

async function requireIndividualEndUserTermsConsent(
  admin: SupabaseClient,
  userId: string,
): Promise<GridEndUserTermsConsentPayload> {
  const consent = await loadGridEndUserTermsConsentForUser(admin, userId)
  if (!consent) {
    throw new Error("grid_end_user_terms_required")
  }
  return consent
}

async function syncEndUserTermsConsentIfNeeded(input: {
  admin: SupabaseClient
  customerId: string
  customer: GridCustomer
  consent: GridEndUserTermsConsentPayload
  userId: string
}): Promise<void> {
  if (!customerNeedsEndUserTermsConsentPatch(input.customer, input.consent)) {
    return
  }
  await gridFetch<GridCustomer>({
    method: "PATCH",
    path: `/customers/${encodeURIComponent(input.customerId)}`,
    json: { endUserTermsConsent: input.consent },
  })
  await markGridEndUserTermsSynced(input.admin, input.userId)
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

  const consent = await requireIndividualEndUserTermsConsent(input.admin, input.userId)

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
      const customer = await gridFetch<GridCustomer>({
        method: "GET",
        path: `/customers/${encodeURIComponent(customerId)}`,
      })
      await syncEndUserTermsConsentIfNeeded({
        admin: input.admin,
        customerId,
        customer,
        consent,
        userId: input.userId,
      })
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
    await syncEndUserTermsConsentIfNeeded({
      admin: input.admin,
      customerId,
      customer: existing,
      consent,
      userId: input.userId,
    })
    return { customerId, platformCustomerId }
  }

  const payload = {
    ...buildGridIndividualCustomerPayload({
      platformCustomerId,
      profile: input.profile,
    }),
    endUserTermsConsent: consent,
  }

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
  await markGridEndUserTermsSynced(input.admin, input.userId)

  return { customerId, platformCustomerId }
}

export {
  gridPlatformCustomerIdForSubject,
  gridPlatformCustomerIdFromBusinessId,
  gridPlatformCustomerIdFromUserId,
}
