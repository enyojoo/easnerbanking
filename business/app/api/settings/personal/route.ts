import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

type PersonalUpdateBody = {
  fullName?: string
  email?: string
  phone?: string
  dateOfBirth?: string
  /** Short HTTPS URL from Storage upload API; null clears. Stored on `users.avatar_url` only — never in JWT metadata. */
  avatarUrl?: string | null
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
    data = r2.data
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

  if ("fullName" in body) {
    updatePayload.full_name = body.fullName?.trim() || null
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

  if ("avatarUrl" in body) {
    const { data: cur, error: getErr } = await admin.auth.admin.getUserById(user.id)
    if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 })
    const meta = { ...(cur.user?.user_metadata ?? {}) } as Record<string, unknown>
    delete meta.avatar_url
    const { error: authErr } = await admin.auth.admin.updateUserById(user.id, { user_metadata: meta })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
  }

  return GET(request)
}
