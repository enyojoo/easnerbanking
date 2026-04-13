import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

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

function hasOwn(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k)
}

/**
 * `undefined` = do not change `full_name`; `null` = clear.
 * Only use split first/middle/last when at least one part is a non-empty string — otherwise
 * `{"firstName":null,"fullName":"Jane"}` would take the split branch, drop `fullName`, and clear the DB name.
 */
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

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  let { data, error } = await admin
    .from("users")
    .select("id,email,full_name,phone,date_of_birth,avatar_url")
    .eq("id", user.id)
    .maybeSingle()

  if (error?.message?.includes("avatar_url") || error?.code === "42703") {
    const r2 = await admin
      .from("users")
      .select("id,email,full_name,phone,date_of_birth")
      .eq("id", user.id)
      .maybeSingle()
    data = r2.data ? { ...r2.data, avatar_url: null } : null
    error = r2.error
  }

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

  return NextResponse.json({
    personal: {
      fullName: data?.full_name ?? fallbackNameFromMeta(user),
      email: data?.email ?? user.email ?? "",
      phone: data?.phone ?? "",
      dateOfBirth: data?.date_of_birth ?? "",
      avatarUrl,
    },
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
  /** Partial PUT: only keys present in JSON are applied (mobile often sends fullName + phone only). */
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

  /**
   * Keep Supabase Auth `user_metadata` aligned with `public.users` so:
   * - Mobile `POST /api/auth/bootstrap` (which reads `session.user.user_metadata.name`) does not fight the DB.
   * - Noah KYC sync and other flows never need to touch `full_name`; profile remains source of truth on the row.
   */
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
