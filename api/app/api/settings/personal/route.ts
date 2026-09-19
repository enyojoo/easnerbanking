import { NextResponse } from "next/server"
import { resolveIsOrgOwnerForUser } from "@/lib/business/org-owner"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import {
  buildVerifiedIdentityFromKycFields,
  isProfileLockedFromKycFields,
  type VerifiedIdentityPayload,
} from "@easner/shared"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import { removeAllProfileAvatarObjects } from "@/lib/profile-avatar-storage"

type PersonalUpdateBody = {
  fullName?: string
  /** Mobile sends split names; joined server-side if `fullName` is absent (avoids relying on a single string field). */
  firstName?: string
  middleName?: string
  lastName?: string
  email?: string
  phone?: string
  dateOfBirth?: string
  /** Short HTTPS URL from Storage upload API; null clears. Stored on `users.avatar_url` only – never in JWT metadata. */
  avatarUrl?: string | null
}

const USER_SELECT =
  "id,email,full_name,phone,date_of_birth,avatar_url,easner_business_id,noah_kyc_status,kyc_verified_at,verification_provider,verification_status,kyc_id_type,kyc_id_number,kyc_id_issuing_country,kyc_address_street,kyc_address_city,kyc_address_state,kyc_address_post_code,kyc_address_country"

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

async function resolveOrgKybApproved(
  admin: ReturnType<typeof createSupabaseAdmin>,
  businessId: string | null | undefined,
): Promise<boolean> {
  if (!businessId) return false
  const { data } = await admin
    .from("businesses")
    .select("verification_provider,verification_status,kyb_verified_at,bridge_kyc_status")
    .eq("id", businessId)
    .maybeSingle()
  return isBusinessTier1Complete(data)
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

  const businessId = (data?.easner_business_id as string | null | undefined) ?? null
  const isOrgOwner = await resolveIsOrgOwnerForUser(admin, user.id, businessId)
  const orgKybApproved = isOrgOwner ? await resolveOrgKybApproved(admin, businessId) : false

  const profileLocked = isProfileLockedFromKycFields(data, { orgKybApproved })
  const verifiedIdentity: VerifiedIdentityPayload = isOrgOwner
    ? buildVerifiedIdentityFromKycFields(data, { orgKybApproved })
    : { visible: false }

  return NextResponse.json({
    personal: {
      fullName: (data?.full_name as string | null) ?? fallbackNameFromMeta(user),
      email: (data?.email as string | null) ?? user.email ?? "",
      phone: (data?.phone as string | null) ?? "",
      dateOfBirth: (data?.date_of_birth as string | null) ?? "",
      avatarUrl,
      profileLocked,
      isOrgOwner,
      showPhoneAndDateOfBirth: isOrgOwner,
    },
    verifiedIdentity,
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
  const businessId = (existing?.easner_business_id as string | null | undefined) ?? null
  const isOrgOwner = await resolveIsOrgOwnerForUser(admin, user.id, businessId)
  const orgKybApproved = isOrgOwner ? await resolveOrgKybApproved(admin, businessId) : false
  const lockOpts = { orgKybApproved }
  const locked = isProfileLockedFromKycFields(existing, lockOpts)

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

  if (!isOrgOwner && ("phone" in body || "dateOfBirth" in body)) {
    return NextResponse.json(
      { error: "Phone and date of birth are not available for your account role." },
      { status: 403 },
    )
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
  if ("phone" in body && isOrgOwner) {
    updatePayload.phone = body.phone?.trim() || null
  }
  if ("dateOfBirth" in body && isOrgOwner) {
    const raw = body.dateOfBirth
    updatePayload.date_of_birth =
      raw === null || raw === undefined || String(raw).trim() === ""
        ? null
        : String(raw).trim().slice(0, 10)
  }
  if ("email" in body) {
    updatePayload.email = body.email?.trim() || user.email || null
  }

  let clearingAvatar = false
  if ("avatarUrl" in body) {
    const v = body.avatarUrl
    clearingAvatar =
      v === null || v === "" || (typeof v === "string" && !v.trim())
    updatePayload.avatar_url =
      clearingAvatar ? null : typeof v === "string" ? v.trim() || null : null
  }

  const { error } = await admin.from("users").upsert(updatePayload, { onConflict: "id" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (clearingAvatar) {
    await removeAllProfileAvatarObjects(user.id)
  }

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
