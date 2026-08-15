import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { gridFetch, GridHttpError } from "./http"
import {
  buildGridBusinessCustomerPayload,
  buildGridBusinessInfoResyncPatch,
  gridBusinessHostedKybBusinessInfoIsOverfilled,
  gridBusinessKybStubFieldsNeedResync,
  gridBusinessTaxIdIsInvalidOnGrid,
  isGridShellBusinessTaxId,
  normalizeStoredBusinessTaxId,
  type GridBusinessProfile,
} from "./business-kyc-metadata"
import { buildGridBusinessProfileShell } from "./business-profile-shell"
import { gridPlatformCustomerIdFromBusinessId } from "./customer-id"
import {
  customerNeedsEndUserTermsConsentPatch,
  loadGridEndUserTermsConsentForBusiness,
  markGridEndUserTermsSynced,
  type GridEndUserTermsConsentPayload,
} from "./end-user-terms-consent"
import { pickGridBeneficialOwner } from "./parse-grid-beneficial-owner-for-users"
import { gridBusinessCustomerUpdatePayload } from "./customer-update-payload"
import { normalizeGridCustomerId } from "./quote-request"
import type { GridCustomer } from "./types"

export type { GridBusinessProfile } from "./business-kyc-metadata"

export type GridBusinessKybContact = {
  email: string
  ownerUserId: string
  ownerFullName: string | null
}

/** Org owner login email for Grid KYB/SumSub; support email is fallback only. */
export async function resolveGridBusinessKybContact(input: {
  admin: SupabaseClient
  businessId: string
  userId: string
  supportEmail?: string | null
}): Promise<GridBusinessKybContact> {
  const ownerUserId = await resolveOrgOwnerUserId(input.admin, input.businessId, input.userId)
  const userIds = [...new Set([ownerUserId, input.userId].filter(Boolean))]
  const { data: users } = await input.admin.from("users").select("id,email,full_name").in("id", userIds)
  const rowById = new Map(
    (users ?? []).map((row) => [
      String(row.id),
      {
        email: String(row.email ?? "").trim(),
        fullName: String(row.full_name ?? "").trim() || null,
      },
    ]),
  )

  const ownerRow = rowById.get(ownerUserId) ?? rowById.get(input.userId)
  const ownerEmail = ownerRow?.email ?? ""
  if (ownerEmail) {
    return {
      email: ownerEmail,
      ownerUserId,
      ownerFullName: ownerRow?.fullName ?? null,
    }
  }

  const supportEmail = String(input.supportEmail ?? "").trim()
  if (supportEmail) {
    return { email: supportEmail, ownerUserId, ownerFullName: ownerRow?.fullName ?? null }
  }

  throw new Error("A contact email is required to start business verification")
}

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

async function clearStoredGridCustomerId(
  admin: SupabaseClient,
  businessId: string,
): Promise<void> {
  await admin
    .from("businesses")
    .update({ grid_customer_id: null, updated_at: new Date().toISOString() })
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
      "name,easetag,registration_number,tax_id,country,registration_country,address_line1,city,state,postal_code,support_email,created_at",
    )
    .eq("id", businessId)
    .maybeSingle()
  if (!data) return null
  return buildGridBusinessProfileShell({
    name: data.name,
    easetag: data.easetag,
    registrationNumber: data.registration_number,
    taxId: data.tax_id,
    country: data.registration_country ?? data.country,
    addressLine1: data.address_line1,
    city: data.city,
    state: data.state,
    postalCode: data.postal_code,
    createdAt: data.created_at,
  })
}

async function withGridBusinessKybContactEmail(
  admin: SupabaseClient,
  businessId: string,
  userId: string,
  profile: GridBusinessProfile,
  supportEmail: string | null | undefined,
): Promise<{ profile: GridBusinessProfile; contact: GridBusinessKybContact }> {
  const contact = await resolveGridBusinessKybContact({
    admin,
    businessId,
    userId,
    supportEmail,
  })
  return { profile: { ...profile, email: contact.email }, contact }
}

async function requireBusinessEndUserTermsConsent(
  admin: SupabaseClient,
  businessId: string,
  userId: string,
): Promise<{ consent: GridEndUserTermsConsentPayload; ownerUserId: string }> {
  const { consent, ownerUserId } = await loadGridEndUserTermsConsentForBusiness(
    admin,
    businessId,
    userId,
  )
  if (!consent) {
    throw new Error("grid_end_user_terms_required")
  }
  return { consent, ownerUserId }
}

async function syncEndUserTermsConsentIfNeeded(input: {
  admin: SupabaseClient
  customerId: string
  customer: GridCustomer
  consent: GridEndUserTermsConsentPayload
  ownerUserId: string
}): Promise<GridCustomer> {
  if (!customerNeedsEndUserTermsConsentPatch(input.customer, input.consent)) {
    return input.customer
  }
  const patched = await gridFetch<GridCustomer>({
    method: "PATCH",
    path: `/customers/${encodeURIComponent(input.customerId)}`,
    json: gridBusinessCustomerUpdatePayload({ endUserTermsConsent: input.consent }),
  })
  await markGridEndUserTermsSynced(input.admin, input.ownerUserId)
  return patched
}

function readGridBusinessTaxId(customer: GridCustomer & Record<string, unknown>): string | null {
  const businessInfo =
    customer.businessInfo && typeof customer.businessInfo === "object"
      ? (customer.businessInfo as Record<string, unknown>)
      : null
  const raw = businessInfo?.taxId ?? businessInfo?.tax_id
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

function canSafelyRecreateGridBusinessCustomer(customer: GridCustomer): boolean {
  const status = String(customer.kybStatus ?? customer.kycStatus ?? "")
    .trim()
    .toUpperCase()
  return status !== "APPROVED" && status !== "REJECTED"
}

function gridBusinessKybStubStillPresent(input: {
  customer: GridCustomer
  platformCustomerId: string
  profile: GridBusinessProfile
}): boolean {
  const customerRecord = input.customer as GridCustomer & Record<string, unknown>
  return gridBusinessKybStubFieldsNeedResync({
    customer: customerRecord,
    platformCustomerId: input.platformCustomerId,
    profile: input.profile,
  })
}

async function deleteGridBusinessCustomerForRecreate(input: {
  admin: SupabaseClient
  businessId: string
  customerId: string
}): Promise<void> {
  await gridFetch({
    method: "DELETE",
    path: `/customers/${encodeURIComponent(input.customerId)}`,
  }).catch((e) => {
    if (e instanceof GridHttpError && e.status === 404) return
    throw e
  })
  await clearStoredGridCustomerId(input.admin, input.businessId)
}

/**
 * Repair historic Grid stubs (null taxId, shell taxId) before hosted KYB link creation.
 * Falls back to delete + recreate when PATCH cannot clear invalid taxId.
 */
async function scrubGridBusinessKybStubFieldsIfNeeded(input: {
  admin: SupabaseClient
  businessId: string
  customerId: string
  customer: GridCustomer
  profile: GridBusinessProfile
  platformCustomerId: string
}): Promise<GridCustomer | "recreate"> {
  const customerRecord = input.customer as GridCustomer & Record<string, unknown>
  if (
    !gridBusinessKybStubFieldsNeedResync({
      customer: customerRecord,
      platformCustomerId: input.platformCustomerId,
      profile: input.profile,
    })
  ) {
    return input.customer
  }

  const skipPatch =
    gridBusinessTaxIdIsInvalidOnGrid({
      customer: customerRecord,
      platformCustomerId: input.platformCustomerId,
      profile: input.profile,
    }) ||
    gridBusinessHostedKybBusinessInfoIsOverfilled({
      customer: customerRecord,
      platformCustomerId: input.platformCustomerId,
      profile: input.profile,
    })

  let patched = input.customer
  if (!skipPatch) {
    const businessInfo = buildGridBusinessInfoResyncPatch({
      platformCustomerId: input.platformCustomerId,
      profile: input.profile,
    })
    try {
      patched = await gridFetch<GridCustomer>({
        method: "PATCH",
        path: `/customers/${encodeURIComponent(input.customerId)}`,
        json: gridBusinessCustomerUpdatePayload({ businessInfo }),
      })
    } catch {
      patched = input.customer
    }
  }

  if (
    !gridBusinessKybStubStillPresent({
      customer: patched,
      platformCustomerId: input.platformCustomerId,
      profile: input.profile,
    })
  ) {
    return patched
  }

  if (!canSafelyRecreateGridBusinessCustomer(patched)) {
    return patched
  }

  await deleteGridBusinessCustomerForRecreate({
    admin: input.admin,
    businessId: input.businessId,
    customerId: input.customerId,
  })
  return "recreate"
}

/** Push the org's real tax id to Grid when create used a shell / stale value. */
async function syncGridBusinessTaxIdIfNeeded(input: {
  customerId: string
  customer: GridCustomer
  profile: GridBusinessProfile
  platformCustomerId: string
}): Promise<GridCustomer> {
  const desired = normalizeStoredBusinessTaxId(input.profile.taxId)
  // Only push a real org tax id — never "fix" Grid with another shell.
  if (!desired || isGridShellBusinessTaxId(desired, input.platformCustomerId)) {
    return input.customer
  }

  const current = readGridBusinessTaxId(input.customer as GridCustomer & Record<string, unknown>)
  const currentDigits = String(current ?? "").replace(/\D/g, "")
  if (currentDigits === desired) return input.customer

  // Only auto-correct when Grid still has our historic shell, or has no tax id yet.
  if (current && !isGridShellBusinessTaxId(current, input.platformCustomerId)) {
    return input.customer
  }

  return gridFetch<GridCustomer>({
    method: "PATCH",
    path: `/customers/${encodeURIComponent(input.customerId)}`,
    json: gridBusinessCustomerUpdatePayload({
      businessInfo: { taxId: desired },
    }),
  })
}

/** Keep Grid customer email aligned with org owner (SumSub primary contact). */
async function syncGridBusinessKybContactEmailIfNeeded(input: {
  customerId: string
  customer: GridCustomer
  desiredEmail: string
}): Promise<GridCustomer> {
  const desired = input.desiredEmail.trim()
  const current = String(input.customer.email ?? "").trim()
  if (!desired || current.toLowerCase() === desired.toLowerCase()) {
    return input.customer
  }

  return gridFetch<GridCustomer>({
    method: "PATCH",
    path: `/customers/${encodeURIComponent(input.customerId)}`,
    json: gridBusinessCustomerUpdatePayload({ email: desired }),
  })
}

/** Ensure beneficial owner has the org owner email for hosted owner KYC. */
async function syncGridBeneficialOwnerEmailIfNeeded(input: {
  customer: GridCustomer & Record<string, unknown>
  contact: GridBusinessKybContact
}): Promise<void> {
  if (!input.customer || typeof input.customer !== "object") return

  const owner = pickGridBeneficialOwner(input.customer, {
    ownerEmail: input.contact.email,
    ownerFullName: input.contact.ownerFullName,
  })
  const ownerId = String(owner?.id ?? "").trim()
  if (!ownerId) return

  const personalInfo =
    owner?.personalInfo && typeof owner.personalInfo === "object"
      ? (owner.personalInfo as Record<string, unknown>)
      : null
  const current = String(personalInfo?.email ?? "").trim()
  const desired = input.contact.email.trim()
  if (!desired || current.toLowerCase() === desired.toLowerCase()) return

  await gridFetch({
    method: "PATCH",
    path: `/beneficial-owners/${encodeURIComponent(ownerId)}`,
    json: { personalInfo: { email: desired } },
  })
}

async function syncGridBusinessKybContactsIfNeeded(input: {
  customerId: string
  customer: GridCustomer
  contact: GridBusinessKybContact
}): Promise<GridCustomer> {
  const customer = await syncGridBusinessKybContactEmailIfNeeded({
    customerId: input.customerId,
    customer: input.customer,
    desiredEmail: input.contact.email,
  })
  await syncGridBeneficialOwnerEmailIfNeeded({
    customer: customer as GridCustomer & Record<string, unknown>,
    contact: input.contact,
  })
  return customer
}

async function finalizeGridBusinessCustomer(input: {
  admin: SupabaseClient
  businessId: string
  customerId: string
  customer: GridCustomer
  profile: GridBusinessProfile
  platformCustomerId: string
  consent: GridEndUserTermsConsentPayload
  ownerUserId: string
  contact: GridBusinessKybContact
  storedId?: string | null
}): Promise<{ customerId: string; customer: GridCustomer } | "recreate"> {
  let customer = await syncEndUserTermsConsentIfNeeded({
    admin: input.admin,
    customerId: input.customerId,
    customer: input.customer,
    consent: input.consent,
    ownerUserId: input.ownerUserId,
  })
  const scrubbed = await scrubGridBusinessKybStubFieldsIfNeeded({
    admin: input.admin,
    businessId: input.businessId,
    customerId: input.customerId,
    customer,
    profile: input.profile,
    platformCustomerId: input.platformCustomerId,
  })
  if (scrubbed === "recreate") return "recreate"
  customer = scrubbed
  customer = await syncGridBusinessTaxIdIfNeeded({
    customerId: input.customerId,
    customer,
    profile: input.profile,
    platformCustomerId: input.platformCustomerId,
  })
  customer = await syncGridBusinessKybContactsIfNeeded({
    customerId: input.customerId,
    customer,
    contact: input.contact,
  })
  if (input.storedId && input.customerId !== input.storedId) {
    await persistGridCustomerId(input.admin, input.businessId, input.customerId)
  }
  return { customerId: input.customerId, customer }
}

/** Ensure a Grid BUSINESS customer exists for the org. */
export async function ensureGridBusinessCustomer(input: {
  admin: SupabaseClient
  userId: string
  businessId: string
  profile?: GridBusinessProfile
}): Promise<{ customerId: string; platformCustomerId: string; customer: GridCustomer }> {
  const platformCustomerId = gridPlatformCustomerIdFromBusinessId(input.businessId)
  const loadedProfile =
    input.profile ?? (await loadGridBusinessProfile(input.admin, input.businessId))
  if (!loadedProfile) {
    throw new Error("Business organization not found")
  }

  const { data: bizRow } = await input.admin
    .from("businesses")
    .select("support_email")
    .eq("id", input.businessId)
    .maybeSingle()
  const supportEmail = String(bizRow?.support_email ?? "").trim() || null

  const { profile, contact } = await withGridBusinessKybContactEmail(
    input.admin,
    input.businessId,
    input.userId,
    loadedProfile,
    supportEmail,
  )
  const { consent, ownerUserId } = await requireBusinessEndUserTermsConsent(
    input.admin,
    input.businessId,
    input.userId,
  )

  const stored = await readStoredGridCustomerId(input.admin, input.businessId)
  let forceCreate = false

  if (stored) {
    const customerId = normalizeGridCustomerId(stored)
    if (await verifyGridCustomerExists(customerId)) {
      const customer = await gridFetch<GridCustomer>({
        method: "GET",
        path: `/customers/${encodeURIComponent(customerId)}`,
      })
      const finalized = await finalizeGridBusinessCustomer({
        admin: input.admin,
        businessId: input.businessId,
        customerId,
        customer,
        profile,
        platformCustomerId,
        consent,
        ownerUserId,
        contact,
        storedId: stored,
      })
      if (finalized !== "recreate") {
        return { customerId: finalized.customerId, platformCustomerId, customer: finalized.customer }
      }
      forceCreate = true
    } else {
      await clearStoredGridCustomerId(input.admin, input.businessId)
      forceCreate = true
    }
  }

  if (!forceCreate) {
    const existing = await findGridCustomerByPlatformId(platformCustomerId).catch(() => null)
    if (existing?.id) {
      const customerId = normalizeGridCustomerId(existing.id)
      await persistGridCustomerId(input.admin, input.businessId, customerId)
      const finalized = await finalizeGridBusinessCustomer({
        admin: input.admin,
        businessId: input.businessId,
        customerId,
        customer: existing,
        profile,
        platformCustomerId,
        consent,
        ownerUserId,
        contact,
      })
      if (finalized !== "recreate") {
        return { customerId: finalized.customerId, platformCustomerId, customer: finalized.customer }
      }
      forceCreate = true
    }
  }

  const payload = {
    ...buildGridBusinessCustomerPayload({
      platformCustomerId,
      profile,
      forGridCreate: true,
    }),
    endUserTermsConsent: consent,
  }
  const created = await gridFetch<GridCustomer>({
    method: "POST",
    path: "/customers",
    json: payload,
    idempotencyKey: forceCreate ? `${platformCustomerId}:hosted-kyb-v2` : platformCustomerId,
  })

  const customerId = normalizeGridCustomerId(String(created.id ?? ""))
  if (!customerId) throw new Error("Grid BUSINESS customer create did not return id")
  await persistGridCustomerId(input.admin, input.businessId, customerId)
  await markGridEndUserTermsSynced(input.admin, ownerUserId)
  return { customerId, platformCustomerId, customer: created }
}
