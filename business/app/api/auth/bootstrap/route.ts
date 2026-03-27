import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromBearer } from "@/lib/supabase/admin"
import { countries } from "@/lib/countries"

type BootstrapBody = {
  countryCode?: string
  role?: "business" | "individual"
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

export async function POST(request: Request) {
  const user = await getUserFromBearer(request)
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let body: BootstrapBody = {}
  try {
    body = (await request.json()) as BootstrapBody
  } catch {
    body = {}
  }

  const role: "business" | "individual" = body.role === "individual" ? "individual" : "business"
  const countryCode = normalizeCountryCode(body.countryCode)
  const country = countryNameFromCode(countryCode)
  const admin = createSupabaseAdmin()

  const { data: userRow } = await admin
    .from("users")
    .select("id,easner_organization_id")
    .eq("id", user.id)
    .maybeSingle()

  const baseUserPayload = {
    id: user.id,
    email: user.email ?? null,
    updated_at: new Date().toISOString(),
  }

  // Support both migrated and pre-migration schemas.
  const { error: upsertErrWithRole } = await admin
    .from("users")
    .upsert({ ...baseUserPayload, easner_role: role }, { onConflict: "id" })
  if (upsertErrWithRole) {
    await admin.from("users").upsert(baseUserPayload, { onConflict: "id" })
  }

  if (role === "individual") {
    return NextResponse.json({ ok: true, role, userId: user.id, organizationId: userRow?.easner_organization_id ?? null })
  }

  let organizationId = userRow?.easner_organization_id ?? null

  if (!organizationId) {
    const orgName = defaultOrgName(user.email, user.id)
    const slugBase = slugify(orgName) || `business-${user.id.slice(0, 8)}`
    const orgPayloadWithCountry = {
      name: orgName,
      slug: `${slugBase}-${user.id.slice(0, 8)}`,
      country,
    }

    const { data: insertedWithCountry, error: insertErrWithCountry } = await admin
      .from("easner_organizations")
      .insert(orgPayloadWithCountry)
      .select("id")
      .single()

    if (insertErrWithCountry) {
      const { data: insertedNoCountry, error: insertErrNoCountry } = await admin
        .from("easner_organizations")
        .insert({
          name: orgName,
          slug: `${slugBase}-${user.id.slice(0, 8)}`,
        })
        .select("id")
        .single()
      if (insertErrNoCountry) {
        return NextResponse.json({ ok: false, error: insertErrNoCountry.message }, { status: 500 })
      }
      organizationId = insertedNoCountry.id
    } else {
      organizationId = insertedWithCountry.id
    }
  } else if (country) {
    await admin.from("easner_organizations").update({ country }).eq("id", organizationId)
  }

  const userLinkPayload = {
    id: user.id,
    email: user.email ?? null,
    easner_organization_id: organizationId,
    updated_at: new Date().toISOString(),
  }

  const { error: linkErrWithRole } = await admin
    .from("users")
    .upsert({ ...userLinkPayload, easner_role: "business" }, { onConflict: "id" })
  if (linkErrWithRole) {
    await admin.from("users").upsert(userLinkPayload, { onConflict: "id" })
  }

  return NextResponse.json({
    ok: true,
    role: "business",
    userId: user.id,
    organizationId,
    country: country ?? null,
  })
}
