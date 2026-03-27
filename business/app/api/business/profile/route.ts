import { NextResponse } from "next/server"
import { countries } from "@/lib/countries"
import { createSupabaseAdmin, getUserFromBearer } from "@/lib/supabase/admin"

type UpdateBody = {
  businessName?: string
  businessLogo?: string | null
  businessType?: string
  baseCurrency?: string
  businessDescription?: string
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

async function ensureOrganizationId(admin: ReturnType<typeof createSupabaseAdmin>, userId: string, email?: string) {
  const { data: userRow } = await admin.from("users").select("easner_organization_id").eq("id", userId).maybeSingle()
  if (userRow?.easner_organization_id) return userRow.easner_organization_id

  const orgName = defaultOrgName(email, userId)
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

export async function GET(request: Request) {
  const user = await getUserFromBearer(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data: userRowWithNames, error: userRowErr } = await admin
    .from("users")
    .select("id,easner_role,easner_organization_id,full_name,first_name,last_name")
    .eq("id", user.id)
    .maybeSingle()
  const { data: userRowFallback } = userRowErr
    ? await admin.from("users").select("id,easner_role,easner_organization_id").eq("id", user.id).maybeSingle()
    : { data: null as { id: string; easner_role: string | null; easner_organization_id: string | null } | null }
  const userRow = (userRowWithNames ??
    (userRowFallback
      ? { ...userRowFallback, full_name: null, first_name: null, last_name: null }
      : null)) as
    | {
        id: string
        easner_role: string | null
        easner_organization_id: string | null
        full_name: string | null
        first_name: string | null
        last_name: string | null
      }
    | null

  let org = null as null | {
    id: string
    name: string | null
    logo_url: string | null
    business_type: string | null
    base_currency: string | null
    description: string | null
    country: string | null
  }

  if (userRow?.easner_organization_id) {
    const { data } = await admin
      .from("easner_organizations")
      .select("id,name,logo_url,business_type,base_currency,description,country")
      .eq("id", userRow.easner_organization_id)
      .maybeSingle()
    org = data
  }

  const onboardingComplete = Boolean(org && org.business_type && org.base_currency && org.description)
  const ownerName =
    userRow?.full_name || [userRow?.first_name, userRow?.last_name].filter(Boolean).join(" ").trim() || user.email || "Admin"

  return NextResponse.json({
    profile: {
      organizationId: org?.id ?? userRow?.easner_organization_id ?? null,
      name: org?.name ?? defaultOrgName(user.email, user.id),
      logoUrl: org?.logo_url ?? null,
      businessType: org?.business_type ?? "Financial Services",
      baseCurrency: org?.base_currency ?? "USD",
      description: org?.description ?? "A modern digital banking platform providing seamless financial services.",
      country: org?.country ?? null,
      countryCode: countryCodeFromName(org?.country),
      onboardingComplete,
      role: userRow?.easner_role ?? "business",
      ownerName,
    },
  })
}

export async function PUT(request: Request) {
  const user = await getUserFromBearer(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: UpdateBody = {}
  try {
    body = (await request.json()) as UpdateBody
  } catch {
    body = {}
  }

  const admin = createSupabaseAdmin()
  const organizationId = await ensureOrganizationId(admin, user.id, user.email)

  const countryCode = normalizeCountryCode(body.countryCode)
  const country = countryNameFromCode(countryCode)
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (body.businessName !== undefined) updates.name = body.businessName?.trim() || null
  if (body.businessLogo !== undefined) updates.logo_url = body.businessLogo
  if (body.businessType !== undefined) updates.business_type = body.businessType?.trim() || null
  if (body.baseCurrency !== undefined) updates.base_currency = body.baseCurrency?.trim() || null
  if (body.businessDescription !== undefined) updates.description = body.businessDescription?.trim() || null
  if (country !== null) updates.country = country

  const { error } = await admin.from("easner_organizations").update(updates).eq("id", organizationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return GET(request)
}
