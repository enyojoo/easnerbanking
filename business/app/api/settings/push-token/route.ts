import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

/**
 * Register or clear the Expo push token for the authenticated user (mobile).
 * Does not return the stored token.
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { expoPushToken?: string | null } = {}
  try {
    body = (await request.json()) as { expoPushToken?: string | null }
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

  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()
  const { error } = await admin
    .from("users")
    .update({
      expo_push_token: token,
      expo_push_token_updated_at: token ? now : null,
      updated_at: now,
    })
    .eq("id", user.id)

  if (error) {
    if (error.code === "42703") {
      return NextResponse.json(
        { error: "expo_push_token column missing — apply latest Supabase migrations." },
        { status: 503 },
      )
    }
    console.error("push-token POST:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, hasExpoPushToken: Boolean(token) })
}
