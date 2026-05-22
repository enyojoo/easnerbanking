import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

/**
 * Register or clear Expo push tokens for the authenticated user (mobile).
 * Canonical storage: `public.user_push_devices` (one row per device token).
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { expoPushToken?: string | null; removeExpoPushToken?: string | null; platform?: string | null } = {}
  try {
    body = (await request.json()) as {
      expoPushToken?: string | null
      removeExpoPushToken?: string | null
      platform?: string | null
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const raw = body.expoPushToken
  const token =
    raw === null || raw === undefined
      ? null
      : typeof raw === "string"
        ? raw.trim() || null
        : null

  const platformRaw = body.platform
  const platform =
    platformRaw === "ios" || platformRaw === "android" || platformRaw === "web" ? platformRaw : null

  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()

  if (token === null) {
    const removeRaw = body.removeExpoPushToken
    const removeToken = typeof removeRaw === "string" ? removeRaw.trim() || null : null
    if (removeToken) {
      const del = await admin
        .from("user_push_devices")
        .delete()
        .eq("user_id", user.id)
        .eq("expo_push_token", removeToken)
      if (del.error && del.error.code !== "42P01") {
        console.warn("push-token delete user_push_devices:", del.error)
        return NextResponse.json({ error: del.error.message }, { status: 500 })
      }
    }

    const { count } = await admin
      .from("user_push_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)

    return NextResponse.json({
      ok: true,
      hasExpoPushToken: false,
      deviceCount: typeof count === "number" ? count : undefined,
    })
  }

  const upsertDevice = await admin.from("user_push_devices").upsert(
    {
      user_id: user.id,
      expo_push_token: token,
      platform,
      last_seen_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,expo_push_token" },
  )

  if (upsertDevice.error) {
    if (upsertDevice.error.code === "42P01" || upsertDevice.error.code === "42703") {
      return NextResponse.json(
        { error: "user_push_devices missing — apply latest Supabase migrations." },
        { status: 503 },
      )
    }
    console.error("push-token upsert user_push_devices:", upsertDevice.error)
    return NextResponse.json({ error: upsertDevice.error.message }, { status: 500 })
  }

  const { count } = await admin
    .from("user_push_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)

  return NextResponse.json({
    ok: true,
    hasExpoPushToken: true,
    deviceCount: typeof count === "number" ? count : undefined,
  })
}
