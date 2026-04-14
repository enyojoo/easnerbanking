import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { countries } from "@/lib/countries"
import { isCountryAllowedForSurface } from "@/lib/jurisdiction-country-policy"

type BootstrapBody = {
  countryCode?: string
  role?: "business" | "individual"
  fullName?: string | null
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

function parseName(fullName: string | null | undefined): { fullName: string | null } {
  const trimmed = typeof fullName === "string" ? fullName.trim() : ""
  if (!trimmed) return { fullName: null }
  return { fullName: trimmed }
}

async function ensureOwnerMembership(params: {
  admin: ReturnType<typeof createSupabaseAdmin>
  businessId: string
  userId: string
  fullName: string | null
  email: string | null
}) {
  const { admin, businessId, userId, fullName, email } = params
  if (!email) return

  // Best-effort: if memberships table is not migrated yet, bootstrap should still succeed.
  await admin.from("business_memberships").upsert(
    {
      business_id: businessId,
      user_id: userId,
      full_name: fullName?.trim() || "Account Owner",
      email: email.trim().toLowerCase(),
      role: "owner",
      status: "active",
      invited_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,email" },
  )
}

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
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
  const metadataName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null
  /** Only JSON string counts as explicit — `fullName: null` must not wipe DB (treat as omit; preserve/seed). */
  const explicitFullNameProvided = typeof body.fullName === "string"
  const explicitName = parseName(explicitFullNameProvided ? body.fullName : null)
  const admin = createSupabaseAdmin()

  if (role === "business" && countryCode) {
    const ok = await isCountryAllowedForSurface(admin, countryCode, "signup")
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "This country is not available for registration. Choose another or contact support." },
        { status: 400 },
      )
    }
  }

  const { data: userRow } = await admin
    .from("users")
    .select("id,easner_business_id,full_name,role")
    .eq("id", user.id)
    .maybeSingle()

  const existingRole =
    userRow?.role === "business" || userRow?.role === "individual" ? userRow.role : null
  const hasBusinessLink = typeof userRow?.easner_business_id === "string" && userRow.easner_business_id.length > 0

  /**
   * Never allow bootstrap to flip an existing account between consumer/business roles.
   * - Existing individual cannot be upgraded to business via bootstrap.
   * - Existing business (or linked org user) cannot be downgraded to individual via bootstrap.
   */
  if (existingRole && existingRole !== role) {
    return NextResponse.json(
      {
        ok: false,
        error:
          existingRole === "individual"
            ? "You're an Easner Mobile user, please sign in through the Easner mobile app."
            : "You're an Easner Business user, please sign in at business.easner.com.",
        code: "ROLE_TRANSITION_DENIED",
      },
      { status: 403 },
    )
  }
  if (role === "individual" && hasBusinessLink) {
    return NextResponse.json(
      {
        ok: false,
        error: "You're an Easner Business user, please sign in at business.easner.com.",
        code: "BUSINESS_LINKED_ACCOUNT",
      },
      { status: 403 },
    )
  }

  const dbFullNameTrim =
    typeof userRow?.full_name === "string" ? userRow.full_name.trim() : ""

  /**
   * `public.users.full_name` is the profile source of truth once set.
   * Mobile bootstrap always sends `body.fullName` from JWT `user_metadata.name`, which often matches
   * Noah/KYC and lags behind SQL or `PUT /api/settings/personal` — never overwrite a non-empty DB name from bootstrap.
   */
  const resolvedBootstrapFullName =
    userRow?.id && dbFullNameTrim.length > 0
      ? dbFullNameTrim
      : explicitFullNameProvided
        ? explicitName.fullName
        : userRow?.id
          ? typeof userRow.full_name === "string"
            ? userRow.full_name
            : null
          : parseName(metadataName).fullName

  const baseUserPayload = {
    id: user.id,
    email: user.email ?? null,
    full_name: resolvedBootstrapFullName,
    updated_at: new Date().toISOString(),
  }

  // Support both migrated and pre-migration schemas.
  const { error: upsertErrWithRole } = await admin
    .from("users")
    .upsert({ ...baseUserPayload, role: existingRole ?? role }, { onConflict: "id" })
  if (upsertErrWithRole) {
    const { error: upsertErrNoRole } = await admin.from("users").upsert(baseUserPayload, { onConflict: "id" })
    if (upsertErrNoRole) {
      await admin
        .from("users")
        .upsert(
          {
            id: user.id,
            email: user.email ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
    }
  }

  /**
   * When DB `full_name` differs from JWT (e.g. edited in Supabase or profile API), align auth metadata
   * so the mobile session can refresh to match without another profile save.
   */
  if (role === "individual" && dbFullNameTrim.length > 0) {
    const jwtName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name.trim() : ""
    if (jwtName !== dbFullNameTrim) {
      try {
        const { data: cur, error: gErr } = await admin.auth.admin.getUserById(user.id)
        if (!gErr && cur?.user) {
          const meta = { ...(cur.user.user_metadata ?? {}) } as Record<string, unknown>
          meta.name = dbFullNameTrim
          await admin.auth.admin.updateUserById(user.id, { user_metadata: meta })
        }
      } catch {
        /* non-fatal */
      }
    }
  }

  if (role === "individual") {
    return NextResponse.json({ ok: true, role, userId: user.id, businessId: userRow?.easner_business_id ?? null })
  }

  let businessId = userRow?.easner_business_id ?? null

  if (!businessId) {
    const first = firstNameFromFullName(resolvedBootstrapFullName)
    const orgName = first ? possessiveBusinessName(first) : defaultOrgName(user.email, user.id)
    const orgPayloadWithCountry = {
      name: orgName,
      easetag: null as string | null,
      country,
    }

    const { data: insertedWithCountry, error: insertErrWithCountry } = await admin
      .from("businesses")
      .insert(orgPayloadWithCountry)
      .select("id")
      .single()

    if (insertErrWithCountry) {
      const { data: insertedNoCountry, error: insertErrNoCountry } = await admin
        .from("businesses")
        .insert({
          name: orgName,
          easetag: null as string | null,
        })
        .select("id")
        .single()
      if (insertErrNoCountry) {
        return NextResponse.json({ ok: false, error: insertErrNoCountry.message }, { status: 500 })
      }
      businessId = insertedNoCountry.id
    } else {
      businessId = insertedWithCountry.id
    }
  }
  // Do not overwrite `businesses.country` on existing orgs: settings / onboarding may diverge from
  // signup localStorage, and the client defaults a missing code to US — that would revert KYB country.

  const userLinkPayload = {
    id: user.id,
    email: user.email ?? null,
    full_name: resolvedBootstrapFullName,
    easner_business_id: businessId,
    updated_at: new Date().toISOString(),
  }

  const { error: linkErrWithRole } = await admin
    .from("users")
    .upsert({ ...userLinkPayload, role: "business" }, { onConflict: "id" })
  if (linkErrWithRole) {
    const { error: linkErrNoRole } = await admin.from("users").upsert(userLinkPayload, { onConflict: "id" })
    if (linkErrNoRole) {
      await admin
        .from("users")
        .upsert(
          {
            id: user.id,
            email: user.email ?? null,
            easner_business_id: businessId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
    }
  }

  await ensureOwnerMembership({
    admin,
    businessId,
    userId: user.id,
    fullName: resolvedBootstrapFullName,
    email: user.email ?? null,
  })

  return NextResponse.json({
    ok: true,
    role: "business",
    userId: user.id,
    businessId,
    country: country ?? null,
  })
}
