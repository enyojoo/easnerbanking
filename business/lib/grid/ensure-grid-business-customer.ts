import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { gridFetch, GridHttpError } from "./http"
import {
  buildGridBusinessCustomerPayload,
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
    json: { endUserTermsConsent: input.consent },
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
    json: {
      businessInfo: { taxId: desired },
    },
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
    json: { email: desired },
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
  if (stored) {
    const customerId = normalizeGridCustomerId(stored)
    if (await verifyGridCustomerExists(customerId)) {
      let customer = await gridFetch<GridCustomer>({
        method: "GET",
        path: `/customers/${encodeURIComponent(customerId)}`,
      })
      customer = await syncEndUserTermsConsentIfNeeded({
        admin: input.admin,
        customerId,
        customer,
        consent,
        ownerUserId,
      })
      customer = await syncGridBusinessTaxIdIfNeeded({
        customerId,
        customer,
        profile,
        platformCustomerId,
      })
      customer = await syncGridBusinessKybContactsIfNeeded({
        customerId,
        customer,
        contact,
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
    let customer = await syncEndUserTermsConsentIfNeeded({
      admin: input.admin,
      customerId,
      customer: existing,
      consent,
      ownerUserId,
    })
    customer = await syncGridBusinessTaxIdIfNeeded({
      customerId,
      customer,
      profile,
      platformCustomerId,
    })
    customer = await syncGridBusinessKybContactsIfNeeded({
      customerId,
      customer,
      contact,
    })
    return { customerId, platformCustomerId, customer }
  }

  const payload = {
    ...buildGridBusinessCustomerPayload({ platformCustomerId, profile }),
    endUserTermsConsent: consent,
  }
  const created = await gridFetch<GridCustomer>({
    method: "POST",
    path: "/customers",
    json: payload,
    idempotencyKey: platformCustomerId,
  })

  const customerId = normalizeGridCustomerId(String(created.id ?? ""))
  if (!customerId) throw new Error("Grid BUSINESS customer create did not return id")
  await persistGridCustomerId(input.admin, input.businessId, customerId)
  await markGridEndUserTermsSynced(input.admin, ownerUserId)
  return { customerId, platformCustomerId, customer: created }
}
