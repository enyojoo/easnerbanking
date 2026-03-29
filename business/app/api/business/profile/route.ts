import { NextResponse } from "next/server"
import { countries } from "@/lib/countries"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

type UpdateBody = {
  businessName?: string
  businessLogo?: string | null
  businessType?: string
  registrationNumber?: string
  taxId?: string
  baseCurrency?: string
  businessDescription?: string
  website?: string
  supportEmail?: string
  supportPhone?: string
  addressLine1?: string
  city?: string
  state?: string
  postalCode?: string
  countryCode?: string
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

function countryNameFromCode(code: string | null): string | null {
  if (!code) return null
  const match = countries.find((c) => c.code === code)
  return match?.name ?? null
}

function countryCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null
  const found = countries.find((c) => c.name.toLowerCase() === name.toLowerCase())
  return found?.code ?? null
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function defaultOrgName(email: string | undefined, fallbackId: string): string {
  const local = (email ?? "").split("@")[0]?.trim()
  if (local) return `${local} Business`
  return `Business ${fallbackId.slice(0, 8)}`
}

function firstNameFromFullName(fullName: string | null | undefined): string | null {
  if (!fullName) return null
  const trimmed = fullName.trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0] ?? null
}

function possessiveBusinessName(firstName: string): string {
  const clean = firstName.replace(/[^a-zA-Z0-9'-]/g, "").trim()
  const base = clean || "Owner"
  return `${base}'s Business`
}

function ownerNameFromAuthUser(user: { user_metadata?: Record<string, unknown> | null; email?: string | null }) {
  const meta = user.user_metadata ?? {}
  const directName = typeof meta.name === "string" ? meta.name.trim() : ""
  if (directName) return directName

  return user.email ?? "Admin"
}

/** Aligns with team API role normalization. */
function normalizeMembershipRole(role: string | null | undefined): "Owner" | "Admin" | "Member" | "Viewer" {
  const value = (role ?? "").toLowerCase()
  if (value === "owner") return "Owner"
  if (value === "admin") return "Admin"
  if (value === "viewer") return "Viewer"
  return "Member"
}

/**
 * Organization Tier 1 (KYB) is stored on the org Owner's `users` row (`noah_kyb_*`).
 * Resolve Owner from memberships; fall back to earliest org user when memberships are absent (legacy).
 */
async function resolveOrgOwnerUserId(
  admin: ReturnType<typeof createSupabaseAdmin>,
  orgId: string,
  fallbackUserId: string,
): Promise<string> {
  const { data: rows, error } = await admin
    .from("easner_organization_memberships")
    .select("user_id,role,status,created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true })

  if (!error && rows?.length) {
    const owner = rows.find(
      (r) => normalizeMembershipRole(r.role) === "Owner" && r.status !== "invited" && r.user_id,
    )
    if (owner?.user_id) return owner.user_id as string
  }

  const { data: orgUsers } = await admin
    .from("users")
    .select("id")
    .eq("easner_organization_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)

  return orgUsers?.[0]?.id ?? fallbackUserId
}

async function resolveCanManageBusinessVerification(
  admin: ReturnType<typeof createSupabaseAdmin>,
  orgId: string | null,
  userId: string,
  orgOwnerUserId: string,
): Promise<boolean> {
  if (!orgId) return true

  const { data: row, error } = await admin
    .from("easner_organization_memberships")
    .select("role,status")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!error && row && row.status !== "invited") {
    return normalizeMembershipRole(row.role) === "Owner"
  }

  return userId === orgOwnerUserId
}

async function ensureOrganizationId(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  email?: string,
  fullName?: string | null,
) {
  const { data: userRow } = await admin.from("users").select("easner_organization_id,full_name").eq("id", userId).maybeSingle()
  if (userRow?.easner_organization_id) return userRow.easner_organization_id

  const first = firstNameFromFullName(fullName ?? userRow?.full_name ?? null)
  const orgName = first ? possessiveBusinessName(first) : defaultOrgName(email, userId)
  const slug = `${slugify(orgName) || `business-${userId.slice(0, 8)}`}-${userId.slice(0, 8)}`
  const { data: org, error } = await admin.from("easner_organizations").insert({ name: orgName, slug }).select("id").single()
  if (error) throw new Error(error.message)

  await admin
    .from("users")
    .upsert(
      {
        id: userId,
        email: email ?? null,
        easner_organization_id: org.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )

  return org.id
}

async function fetchOrganizationProfile(admin: ReturnType<typeof createSupabaseAdmin>, organizationId: string) {
  const richSelect =
    "id,name,logo_url,business_type,registration_number,tax_id,base_currency,description,website,support_email,support_phone,address_line1,city,state,postal_code,country"
  const baseSelect = "id,name,logo_url,business_type,base_currency,description,country"
  const minimalSelect = "id,name,country"

  const rich = await admin.from("easner_organizations").select(richSelect).eq("id", organizationId).maybeSingle()
  if (!rich.error && rich.data) return rich.data

  const base = await admin.from("easner_organizations").select(baseSelect).eq("id", organizationId).maybeSingle()
  if (!base.error && base.data) return base.data

  const minimal = await admin.from("easner_organizations").select(minimalSelect).eq("id", organizationId).maybeSingle()
  return minimal.data ?? null
}

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data: userRowWithName, error: userRowErr } = await admin
    .from("users")
    .select("id,easner_role,easner_organization_id,full_name")
    .eq("id", user.id)
    .maybeSingle()
  const { data: userRowFallback } = userRowErr
    ? await admin.from("users").select("id,easner_role,easner_organization_id").eq("id", user.id).maybeSingle()
    : { data: null as { id: string; easner_role: string | null; easner_organization_id: string | null } | null }
  const userRow = (userRowWithName ??
    (userRowFallback
      ? { ...userRowFallback, full_name: null }
      : null)) as
    | {
        id: string
        easner_role: string | null
        easner_organization_id: string | null
        full_name: string | null
      }
    | null

  let org = null as null | {
    id: string
    name: string | null
    logo_url: string | null
    business_type: string | null
    registration_number: string | null
    tax_id: string | null
    base_currency: string | null
    description: string | null
    website: string | null
    support_email: string | null
    support_phone: string | null
    address_line1: string | null
    city: string | null
    state: string | null
    postal_code: string | null
    country: string | null
  }

  if (userRow?.easner_organization_id) {
    org = (await fetchOrganizationProfile(admin, userRow.easner_organization_id)) as typeof org
  }

  const onboardingComplete = Boolean(org && org.business_type && org.base_currency && org.description)
  const ownerNameFromAuth = ownerNameFromAuthUser(user)
  const ownerName = userRow?.full_name || ownerNameFromAuth
  const generatedOrgName = (() => {
    const first = firstNameFromFullName(ownerName)
    if (first) return possessiveBusinessName(first)
    return defaultOrgName(user.email, user.id)
  })()

  const orgId = userRow?.easner_organization_id ?? null
  let tier1Complete = false
  let tier1VerificationStatus: string | null = null
  /** Internal: org Owner's Noah KYB customer id (same row as tier1VerificationStatus). */
  let noahKybCustomerId: string | null = null
  let canManageBusinessVerification = true

  if (orgId) {
    const orgOwnerUserId = await resolveOrgOwnerUserId(admin, orgId, user.id)
    canManageBusinessVerification = await resolveCanManageBusinessVerification(admin, orgId, user.id, orgOwnerUserId)

    const { data: ownerKyb } = await admin
      .from("users")
      .select("noah_kyb_status,noah_kyb_customer_id")
      .eq("id", orgOwnerUserId)
      .maybeSingle()

    tier1VerificationStatus = (ownerKyb?.noah_kyb_status as string | null | undefined) ?? null
    noahKybCustomerId = (ownerKyb?.noah_kyb_customer_id as string | null | undefined) ?? null
    tier1Complete = tier1VerificationStatus === "approved"
  }

  return NextResponse.json({
    profile: {
      organizationId: org?.id ?? userRow?.easner_organization_id ?? null,
      name: (org?.name ?? "").trim() || generatedOrgName,
      logoUrl: org?.logo_url ?? null,
      businessType: org?.business_type ?? "",
      registrationNumber: org?.registration_number ?? "",
      taxId: org?.tax_id ?? "",
      baseCurrency: org?.base_currency ?? "USD",
      description: org?.description ?? "",
      website: org?.website ?? "",
      supportEmail: org?.support_email ?? "",
      supportPhone: org?.support_phone ?? "",
      addressLine1: org?.address_line1 ?? "",
      city: org?.city ?? "",
      state: org?.state ?? "",
      postalCode: org?.postal_code ?? "",
      country: org?.country ?? null,
      countryCode: countryCodeFromName(org?.country),
      onboardingComplete,
      role: userRow?.easner_role ?? "business",
      ownerName,
      tier1Complete,
      tier1VerificationStatus,
      noahKybCustomerId,
      canManageBusinessVerification,
    },
  })
}

export async function PUT(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: UpdateBody = {}
  try {
    body = (await request.json()) as UpdateBody
  } catch {
    body = {}
  }

  const admin = createSupabaseAdmin()
  const organizationId = await ensureOrganizationId(
    admin,
    user.id,
    user.email,
    typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null,
  )

  const countryCode = normalizeCountryCode(body.countryCode)
  const country = countryNameFromCode(countryCode)
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (body.businessName !== undefined) updates.name = body.businessName?.trim() || null
  if (body.businessLogo !== undefined) updates.logo_url = body.businessLogo
  if (body.businessType !== undefined) updates.business_type = body.businessType?.trim() || null
  if (body.registrationNumber !== undefined) updates.registration_number = body.registrationNumber?.trim() || null
  if (body.taxId !== undefined) updates.tax_id = body.taxId?.trim() || null
  if (body.baseCurrency !== undefined) updates.base_currency = body.baseCurrency?.trim() || null
  if (body.businessDescription !== undefined) updates.description = body.businessDescription?.trim() || null
  if (body.website !== undefined) updates.website = body.website?.trim() || null
  if (body.supportEmail !== undefined) updates.support_email = body.supportEmail?.trim() || null
  if (body.supportPhone !== undefined) updates.support_phone = body.supportPhone?.trim() || null
  if (body.addressLine1 !== undefined) updates.address_line1 = body.addressLine1?.trim() || null
  if (body.city !== undefined) updates.city = body.city?.trim() || null
  if (body.state !== undefined) updates.state = body.state?.trim() || null
  if (body.postalCode !== undefined) updates.postal_code = body.postalCode?.trim() || null
  if (country !== null) updates.country = country

  const { error } = await admin.from("easner_organizations").update(updates).eq("id", organizationId)
  if (error) {
    // Fallback for older schemas that don't yet include all optional settings columns.
    const minimalUpdates: Record<string, unknown> = {
      updated_at: updates.updated_at,
    }
    if (updates.name !== undefined) minimalUpdates.name = updates.name
    if (updates.country !== undefined) minimalUpdates.country = updates.country
    if (updates.logo_url !== undefined) minimalUpdates.logo_url = updates.logo_url
    if (updates.business_type !== undefined) minimalUpdates.business_type = updates.business_type
    if (updates.base_currency !== undefined) minimalUpdates.base_currency = updates.base_currency
    if (updates.description !== undefined) minimalUpdates.description = updates.description

    const retry = await admin.from("easner_organizations").update(minimalUpdates).eq("id", organizationId)
    if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 })
  }

  return GET(request)
}
