import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import {
  countryDisplayName,
  mapNoahIdTypeLabel,
  maskIdNumber,
} from "@/lib/noah/parse-noah-customer-for-users"

type PersonalUpdateBody = {
  fullName?: string
  /** Mobile sends split names; joined server-side if `fullName` is absent (avoids relying on a single string field). */
  firstName?: string
  middleName?: string
  lastName?: string
  email?: string
  phone?: string
  dateOfBirth?: string
  /** Short HTTPS URL from Storage upload API; null clears. Stored on `users.avatar_url` only — never in JWT metadata. */
  avatarUrl?: string | null
}

const USER_SELECT =
  "id,email,full_name,phone,date_of_birth,avatar_url,noah_kyc_status,kyc_verified_at,kyc_id_type,kyc_id_number,kyc_id_issuing_country,kyc_address_street,kyc_address_city,kyc_address_state,kyc_address_post_code,kyc_address_country"

const USER_SELECT_LEGACY =
  "id,email,full_name,phone,date_of_birth,avatar_url,noah_kyc_status"

function hasOwn(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k)
}

function resolveFullNameForUpdate(body: PersonalUpdateBody): string | null | undefined {
  const splitParts = [body.firstName, body.middleName, body.lastName]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
  if (splitParts.length > 0) {
    return splitParts.join(" ")
  }
  if (hasOwn(body, "fullName")) {
    const v = body.fullName
    if (v === null || v === undefined) return null
    if (typeof v !== "string") return null
    const t = v.trim()
    return t.length ? t : null
  }
  return undefined
}

function fallbackNameFromMeta(user: { user_metadata?: Record<string, unknown> | null; email?: string | null }) {
  const meta = user.user_metadata ?? {}
  if (typeof meta.name === "string" && meta.name.trim()) return meta.name.trim()
  return user.email ?? "User"
}

function isProfileLocked(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false
  const status = String(row.noah_kyc_status ?? "").toLowerCase()
  return status === "approved" && row.kyc_verified_at != null
}

function buildVerifiedIdentity(row: Record<string, unknown> | null | undefined) {
  if (!row || !isProfileLocked(row)) {
    return { visible: false as const }
  }
  const hasId = Boolean(row.kyc_id_type || row.kyc_id_number)
  const hasAddress = Boolean(row.kyc_address_street)
  if (!hasId && !hasAddress) {
    return { visible: false as const }
  }

  const issuingCode =
    typeof row.kyc_id_issuing_country === "string" ? row.kyc_id_issuing_country.trim().toUpperCase() : ""
  const addressCountryCode =
    typeof row.kyc_address_country === "string" ? row.kyc_address_country.trim().toUpperCase() : ""

  const addressLines: string[] = []
  if (typeof row.kyc_address_street === "string" && row.kyc_address_street.trim()) {
    addressLines.push(row.kyc_address_street.trim())
  }
  const cityLine = [
    typeof row.kyc_address_city === "string" ? row.kyc_address_city.trim() : "",
    typeof row.kyc_address_state === "string" ? row.kyc_address_state.trim() : "",
    typeof row.kyc_address_post_code === "string" ? row.kyc_address_post_code.trim() : "",
  ]
    .filter(Boolean)
    .join(", ")
  if (cityLine) addressLines.push(cityLine)

  const idTypeRaw = typeof row.kyc_id_type === "string" ? row.kyc_id_type : null

  return {
    visible: true as const,
    idType: idTypeRaw ? mapNoahIdTypeLabel(idTypeRaw) : null,
    idTypeRaw,
    idNumberMasked:
      typeof row.kyc_id_number === "string" && row.kyc_id_number.trim()
        ? maskIdNumber(row.kyc_id_number)
        : null,
    issuingCountry: issuingCode
      ? { code: issuingCode, name: countryDisplayName(issuingCode) }
      : null,
    addressLines,
    addressCountry: addressCountryCode
      ? { code: addressCountryCode, name: countryDisplayName(addressCountryCode) }
      : null,
  }
}

async function fetchUserRow(admin: ReturnType<typeof createSupabaseAdmin>, userId: string) {
  let { data, error } = await admin.from("users").select(USER_SELECT).eq("id", userId).maybeSingle()
  if (error?.code === "42703" || error?.message?.includes("kyc_")) {
    const r2 = await admin.from("users").select(USER_SELECT_LEGACY).eq("id", userId).maybeSingle()
    data = r2.data
    error = r2.error
  }
  return { data: data as Record<string, unknown> | null, error }
}

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data, error } = await fetchUserRow(admin, user.id)

  if (error) {
    console.error("personal GET users:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let avatarUrl =
    typeof data?.avatar_url === "string" && data.avatar_url.trim() ? data.avatar_url.trim() : null

  const { data: authUser } = await admin.auth.admin.getUserById(user.id)
  const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>
  const metaAvatar = meta.avatar_url

  let sessionRefreshSuggested = false

  if (typeof metaAvatar === "string" && metaAvatar.length > 0) {
    if (!avatarUrl && metaAvatar.startsWith("http")) {
      avatarUrl = metaAvatar.trim()
      const { error: upErr } = await admin
        .from("users")
        .update({
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
      if (upErr) console.error("personal GET migrate avatar_url:", upErr)
    }

    const cleaned = { ...meta }
    delete cleaned.avatar_url
    const { error: authErr } = await admin.auth.admin.updateUserById(user.id, { user_metadata: cleaned })
    if (authErr) {
      console.error("personal GET strip metadata avatar_url:", authErr)
    } else {
      sessionRefreshSuggested = true
    }
  }

  const profileLocked = isProfileLocked(data)

  return NextResponse.json({
    personal: {
      fullName: (data?.full_name as string | null) ?? fallbackNameFromMeta(user),
      email: (data?.email as string | null) ?? user.email ?? "",
      phone: (data?.phone as string | null) ?? "",
      dateOfBirth: (data?.date_of_birth as string | null) ?? "",
      avatarUrl,
      profileLocked,
    },
    verifiedIdentity: buildVerifiedIdentity(data),
    sessionRefreshSuggested,
  })
}

export async function PUT(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: PersonalUpdateBody = {}
  try {
    body = (await request.json()) as PersonalUpdateBody
  } catch {
    body = {}
  }

  const admin = createSupabaseAdmin()
  const { data: existing } = await fetchUserRow(admin, user.id)
  const locked = isProfileLocked(existing)

  if (locked) {
    const wantsName =
      resolveFullNameForUpdate(body) !== undefined ||
      "firstName" in body ||
      "middleName" in body ||
      "lastName" in body
    const wantsDob = "dateOfBirth" in body
    if (wantsName || wantsDob) {
      return NextResponse.json(
        { error: "Verified profile fields (name and date of birth) cannot be changed." },
        { status: 403 },
      )
    }
  }

  const updatePayload: Record<string, unknown> = {
    id: user.id,
    updated_at: new Date().toISOString(),
    email: user.email ?? null,
  }

  const resolvedFullName = resolveFullNameForUpdate(body)
  if (resolvedFullName !== undefined) {
    updatePayload.full_name = resolvedFullName
  }
  if ("phone" in body) {
    updatePayload.phone = body.phone?.trim() || null
  }
  if ("dateOfBirth" in body) {
    const raw = body.dateOfBirth
    updatePayload.date_of_birth =
      raw === null || raw === undefined || String(raw).trim() === ""
        ? null
        : String(raw).trim().slice(0, 10)
  }
  if ("email" in body) {
    updatePayload.email = body.email?.trim() || user.email || null
  }

  if ("avatarUrl" in body) {
    const v = body.avatarUrl
    updatePayload.avatar_url =
      v === null || v === "" ? null : typeof v === "string" ? v.trim() || null : null
  }

  const { error } = await admin.from("users").upsert(updatePayload, { onConflict: "id" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const shouldSyncAuthMetadata = "avatarUrl" in body || resolvedFullName !== undefined
  if (shouldSyncAuthMetadata) {
    const { data: cur, error: getErr } = await admin.auth.admin.getUserById(user.id)
    if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 })
    const meta = { ...(cur.user?.user_metadata ?? {}) } as Record<string, unknown>
    if ("avatarUrl" in body) {
      delete meta.avatar_url
    }
    if (resolvedFullName !== undefined) {
      if (typeof resolvedFullName === "string" && resolvedFullName.trim().length > 0) {
        meta.name = resolvedFullName.trim()
      } else {
        delete meta.name
      }
    }
    const { error: authErr } = await admin.auth.admin.updateUserById(user.id, { user_metadata: meta })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
  }

  return GET(request)
}
