import { NextResponse } from "next/server"
import { removeAllOrganizationLogoObjects } from "@/lib/organization-logo-storage"
import { countries, displayCountryFromBusinessSetting } from "@/lib/countries"
import { ensureBusinessOperationalAddressCountriesRegistered } from "@/lib/address/register-lib-address-countries"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  defaultBusinessOrgName,
  ensureBusinessOrganizationId,
  firstNameFromFullName,
  possessiveBusinessOrgName,
} from "@/lib/business/ensure-business-organization"
import { resolveInvoiceReplyEmailWithSource } from "@/lib/invoices/issuer"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { isBusinessProfileLockedFromKybFields, getVerificationRejectionDisplay } from "@easner/shared"
import {
  businessHostedKybCustomerId,
  businessTier1RejectionReasons,
  businessTier1Status,
  isBusinessTier1Complete,
} from "@/lib/compliance/business-tier1"
import { validateEasetag, normalizeEasetag } from "@/lib/easetag-validation"
import { isEasetagGloballyAvailable } from "@/lib/easetag-global"
import { isValidIndustryId } from "@/lib/business-industries"
import { isAllowedBaseCurrency } from "@/lib/accounts/currency-controls"
import { isCountryAllowedForSurface } from "@/lib/jurisdiction-country-policy"
import {
  parseBusinessInvoiceSettings,
  invoiceSettingsToDbPayload,
  type BusinessInvoiceSettings,
} from "@/lib/invoices/invoice-settings"
import type { InvoicePaymentDefaults } from "@/lib/b2b/types"
import { validateOperationalAddress } from "@easner/shared/postal-address-form"

type UpdateBody = {
  businessName?: string
  easetag?: string | null
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
  invoiceSettings?: Partial<InvoicePaymentDefaults>
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

async function resolveCanManageBusinessVerification(
  admin: ReturnType<typeof createSupabaseAdmin>,
  orgId: string | null,
  userId: string,
  orgOwnerUserId: string,
): Promise<boolean> {
  if (!orgId) return true

  const { data: row, error } = await admin
    .from("business_memberships")
    .select("role,status")
    .eq("business_id", orgId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!error && row && row.status !== "invited") {
    return normalizeMembershipRole(row.role) === "Owner"
  }

  return userId === orgOwnerUserId
}

async function fetchBusinessProfile(admin: ReturnType<typeof createSupabaseAdmin>, businessId: string) {
  const richSelect =
    "id,name,easetag,logo_url,business_type,registration_number,tax_id,base_currency,description,website,support_email,support_phone,address_line1,city,state,postal_code,registered_address_line1,registered_address_city,registered_address_state,registered_address_postal_code,country,registration_country,verification_status,kyb_verified_at,invoice_settings"
  const baseSelect = "id,name,easetag,logo_url,business_type,base_currency,description,country"
  const minimalSelect = "id,name,easetag,country"

  const rich = await admin.from("businesses").select(richSelect).eq("id", businessId).maybeSingle()
  if (!rich.error && rich.data) return rich.data

  const base = await admin.from("businesses").select(baseSelect).eq("id", businessId).maybeSingle()
  if (!base.error && base.data) return base.data

  const minimal = await admin.from("businesses").select(minimalSelect).eq("id", businessId).maybeSingle()
  return minimal.data ?? null
}

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data: userRowWithName, error: userRowErr } = await admin
    .from("users")
    .select("id,role,easner_business_id,full_name")
    .eq("id", user.id)
    .maybeSingle()
  const { data: userRowFallback } = userRowErr
    ? await admin.from("users").select("id,role,easner_business_id").eq("id", user.id).maybeSingle()
    : { data: null as { id: string; role: string | null; easner_business_id: string | null } | null }
  const userRow = (userRowWithName ??
    (userRowFallback
      ? { ...userRowFallback, full_name: null }
      : null)) as
    | {
        id: string
        role: string | null
        easner_business_id: string | null
        full_name: string | null
      }
    | null

  let org = null as null | {
    id: string
    name: string | null
    easetag: string | null
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
    registered_address_line1: string | null
    registered_address_city: string | null
    registered_address_state: string | null
    registered_address_postal_code: string | null
    country: string | null
    registration_country: string | null
    verification_status?: string | null
    kyb_verified_at?: string | null
    invoice_settings?: unknown
  }

  const ownerNameFromAuth = ownerNameFromAuthUser(user)
  const ownerName = userRow?.full_name || ownerNameFromAuth

  /**
   * Provision the org on read when it's missing so Settings / Compliance is never a dead-end.
   * Bootstrap normally creates it at sign-in, but that runs deferred + throttled and can fail;
   * GET must not depend on it having succeeded. Idempotent, and skipped for explicit individuals.
   */
  let orgId = userRow?.easner_business_id ?? null
  if (!orgId && userRow?.role !== "individual") {
    try {
      orgId = await ensureBusinessOrganizationId(admin, {
        userId: user.id,
        email: user.email ?? null,
        fullName:
          userRow?.full_name ??
          (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null),
      })
    } catch {
      orgId = null
    }
  }

  if (orgId) {
    org = (await fetchBusinessProfile(admin, orgId)) as typeof org
  }

  const onboardingComplete = Boolean(org && org.business_type && org.base_currency && org.description)
  const generatedOrgName = (() => {
    const first = firstNameFromFullName(ownerName)
    if (first) return possessiveBusinessOrgName(first)
    return defaultBusinessOrgName(user.email, user.id)
  })()
  let tier1Complete = false
  let tier1VerificationStatus: string | null = null
  let tier1RejectionReasons: unknown[] | null = null
  /** Grid customer id for hosted KYB on the org. */
  let noahKybCustomerId: string | null = null
  let canManageBusinessVerification = true
  let orgKyb: Record<string, unknown> | null = null

  if (orgId) {
    const orgOwnerUserId = await resolveOrgOwnerUserId(admin, orgId, user.id)
    canManageBusinessVerification = await resolveCanManageBusinessVerification(admin, orgId, user.id, orgOwnerUserId)

    const { data: orgKybRow } = await admin
      .from("businesses")
      .select(
        "verification_status,verification_provider,verification_rejection_reasons,grid_customer_id,kyb_verified_at",
      )
      .eq("id", orgId)
      .maybeSingle()

    orgKyb = (orgKybRow as Record<string, unknown> | null) ?? null

    const kybFields = orgKyb as Parameters<typeof businessTier1Status>[0]
    tier1VerificationStatus = businessTier1Status(kybFields)
    noahKybCustomerId = businessHostedKybCustomerId(kybFields)
    tier1RejectionReasons = businessTier1RejectionReasons(kybFields)
    tier1Complete = isBusinessTier1Complete(kybFields)
  }

  const profileLocked =
    orgId && orgKyb
      ? isBusinessProfileLockedFromKybFields(orgKyb as Record<string, unknown>)
      : org
        ? isBusinessProfileLockedFromKybFields(org as Record<string, unknown>)
        : false

  let invoiceReplyEmail: string | null = null
  let invoiceReplyEmailSource: "support" | "owner" | "sender" | null = null
  let invoiceSettings: BusinessInvoiceSettings = parseBusinessInvoiceSettings(null)
  if (orgId) {
    const reply = await resolveInvoiceReplyEmailWithSource(admin, orgId, user.id)
    if (reply) {
      invoiceReplyEmail = reply.email
      invoiceReplyEmailSource = reply.source
    }
  }

  if (org?.invoice_settings != null) {
    invoiceSettings = parseBusinessInvoiceSettings(org.invoice_settings)
  }

  const tier1RejectionDisplay = getVerificationRejectionDisplay(tier1RejectionReasons)
  const tier1RejectionType = tier1RejectionDisplay.rejectType
  const tier1CanResubmit = tier1RejectionDisplay.canResubmit
  const tier1RetryGuidance = tier1RejectionDisplay.guidanceLines

  return NextResponse.json({
    profile: {
      businessId: org?.id ?? orgId ?? userRow?.easner_business_id ?? null,
      name: (org?.name ?? "").trim() || generatedOrgName,
      easetag: org?.easetag ?? null,
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
      registeredAddressLine1: org?.registered_address_line1 ?? "",
      registeredAddressCity: org?.registered_address_city ?? "",
      registeredAddressState: org?.registered_address_state ?? "",
      registeredAddressPostalCode: org?.registered_address_postal_code ?? "",
      country: (() => {
        const d = displayCountryFromBusinessSetting(org?.country)
        return d || null
      })(),
      countryCode: countryCodeFromName(displayCountryFromBusinessSetting(org?.country) || org?.country),
      registrationCountry: (() => {
        const d = displayCountryFromBusinessSetting(org?.registration_country ?? org?.country)
        return d || null
      })(),
      registrationCountryCode: countryCodeFromName(
        displayCountryFromBusinessSetting(org?.registration_country ?? org?.country) ||
          org?.registration_country ||
          org?.country,
      ),
      onboardingComplete,
      role: userRow?.role ?? "business",
      ownerName,
      tier1Complete,
      tier1VerificationStatus,
      tier1RejectionReasons,
      tier1RejectionType,
      tier1CanResubmit,
      tier1RetryGuidance,
      noahKybCustomerId,
      canManageBusinessVerification,
      profileLocked,
      invoiceReplyEmail,
      invoiceReplyEmailSource,
      invoiceSettings,
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

  if (body.businessType !== undefined) {
    const t = typeof body.businessType === "string" ? body.businessType.trim() : ""
    if (t.length > 0 && !isValidIndustryId(t)) {
      return NextResponse.json({ error: "Invalid business industry" }, { status: 400 })
    }
  }

  if (body.baseCurrency !== undefined) {
    const raw = typeof body.baseCurrency === "string" ? body.baseCurrency.trim().toUpperCase() : ""
    if (raw.length > 0 && !(await isAllowedBaseCurrency(raw))) {
      return NextResponse.json({ error: "Base currency is not available" }, { status: 400 })
    }
  }

  const admin = createSupabaseAdmin()
  const businessId = await ensureBusinessOrganizationId(admin, {
    userId: user.id,
    email: user.email ?? null,
    fullName: typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null,
  })

  const { data: orgRow } = await admin
    .from("businesses")
    .select(
      "name,country,registration_number,tax_id,address_line1,city,state,postal_code,verification_status,kyb_verified_at",
    )
    .eq("id", businessId)
    .maybeSingle()

  const profileLocked = isBusinessProfileLockedFromKybFields(
    (orgRow ?? null) as Record<string, unknown> | null,
  )

  if (profileLocked) {
    const blocked =
      body.businessName !== undefined ||
      body.registrationNumber !== undefined ||
      body.taxId !== undefined
    if (blocked) {
      return NextResponse.json(
        { error: "Verified business fields cannot be changed after KYB approval." },
        { status: 403 },
      )
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (body.countryCode !== undefined) {
    if (typeof body.countryCode !== "string") {
      return NextResponse.json({ error: "Invalid country code" }, { status: 400 })
    }
    const raw = body.countryCode.trim()
    if (raw === "") {
      updates.country = null
    } else {
      const cc = normalizeCountryCode(body.countryCode)
      if (!cc) {
        return NextResponse.json({ error: "Invalid country code" }, { status: 400 })
      }
      if (!isCountryAllowedForSurface(cc, "kyb")) {
        return NextResponse.json(
          { error: "This country is not allowed for your business profile." },
          { status: 400 },
        )
      }
      const name = countryNameFromCode(cc)
      if (name) updates.country = name
    }
  }

  if (body.easetag !== undefined) {
    const raw = body.easetag
    if (raw === null || String(raw).trim() === "") {
      updates.easetag = null
    } else {
      const v = validateEasetag(String(raw))
      if (!v.valid) {
        return NextResponse.json({ error: v.error ?? "Invalid Easetag" }, { status: 400 })
      }
      const globallyOk = await isEasetagGloballyAvailable(admin, String(raw), {
        excludeBusinessId: businessId,
      })
      if (!globallyOk) {
        return NextResponse.json({ error: "Easetag is already taken" }, { status: 409 })
      }
      updates.easetag = normalizeEasetag(String(raw))
    }
  }

  if (body.businessName !== undefined) updates.name = body.businessName?.trim() || null

  let clearingLogo = false
  if (body.businessLogo !== undefined) {
    const v = body.businessLogo
    clearingLogo =
      v === null || v === "" || (typeof v === "string" && !v.trim())
    updates.logo_url =
      clearingLogo ? null : typeof v === "string" ? v.trim() || null : null
  }

  if (body.businessType !== undefined) updates.business_type = body.businessType?.trim() || null
  if (body.registrationNumber !== undefined) updates.registration_number = body.registrationNumber?.trim() || null
  if (body.taxId !== undefined) updates.tax_id = body.taxId?.trim() || null
  if (body.baseCurrency !== undefined) {
    const cur = body.baseCurrency?.trim() || ""
    updates.base_currency = cur ? cur.toUpperCase() : null
  }
  if (body.businessDescription !== undefined) updates.description = body.businessDescription?.trim() || null
  if (body.website !== undefined) updates.website = body.website?.trim() || null
  if (body.supportEmail !== undefined) updates.support_email = body.supportEmail?.trim() || null
  if (body.supportPhone !== undefined) updates.support_phone = body.supportPhone?.trim() || null
  if (body.addressLine1 !== undefined) updates.address_line1 = body.addressLine1?.trim() || null
  if (body.city !== undefined) updates.city = body.city?.trim() || null
  if (body.state !== undefined) updates.state = body.state?.trim() || null
  if (body.postalCode !== undefined) updates.postal_code = body.postalCode?.trim() || null

  const addressTouched =
    body.addressLine1 !== undefined ||
    body.city !== undefined ||
    body.state !== undefined ||
    body.postalCode !== undefined ||
    body.countryCode !== undefined

  if (addressTouched) {
    await ensureBusinessOperationalAddressCountriesRegistered()

    const operationalCountryCode =
      body.countryCode !== undefined
        ? normalizeCountryCode(body.countryCode) ?? ""
        : countryCodeFromName((orgRow?.country as string | null) ?? null) ??
          normalizeCountryCode((orgRow?.country as string | null) ?? "") ??
          ""

    const validation = validateOperationalAddress(operationalCountryCode, {
      line1:
        body.addressLine1 !== undefined
          ? body.addressLine1
          : ((orgRow?.address_line1 as string | null) ?? ""),
      city: body.city !== undefined ? body.city : ((orgRow?.city as string | null) ?? ""),
      state: body.state !== undefined ? body.state : ((orgRow?.state as string | null) ?? ""),
      postalCode:
        body.postalCode !== undefined
          ? body.postalCode
          : ((orgRow?.postal_code as string | null) ?? ""),
      countryCode: operationalCountryCode,
    })

    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid business address", fieldErrors: validation.errors },
        { status: 400 },
      )
    }
  }

  if (body.invoiceSettings !== undefined) {
    const { data: existingBiz } = await admin
      .from("businesses")
      .select("invoice_settings")
      .eq("id", businessId)
      .maybeSingle()
    const current = parseBusinessInvoiceSettings(existingBiz?.invoice_settings)
    const merged = { ...current, ...body.invoiceSettings }
    updates.invoice_settings = invoiceSettingsToDbPayload(merged)
  }

  const { error } = await admin.from("businesses").update(updates).eq("id", businessId)
  if (!error && clearingLogo) {
    await removeAllOrganizationLogoObjects(businessId)
  }
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
    if (updates.easetag !== undefined) minimalUpdates.easetag = updates.easetag

    const retry = await admin.from("businesses").update(minimalUpdates).eq("id", businessId)
    if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 })
    if (clearingLogo) {
      await removeAllOrganizationLogoObjects(businessId)
    }
  }

  return GET(request)
}
