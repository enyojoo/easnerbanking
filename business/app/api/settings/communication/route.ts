import { NextResponse } from "next/server"
import { parseCommunicationPreferences, type CommunicationPreferences } from "@easner/shared"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

type PatchBody = Partial<{
  productUpdates: boolean
  securityAlerts: boolean
  marketingEmails: boolean
  channels: Partial<{
    email: boolean
    push: boolean
  }>
}>

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("user_preferences")
    .select("communication_preferences")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error && error.code !== "42703") {
    console.error("communication GET:", error)
    // If user_preferences table doesn't exist yet, fall back to legacy users column.
    if (error.code !== "42P01") {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  let preferences: CommunicationPreferences | null = null
  if (data && "communication_preferences" in data) {
    preferences = parseCommunicationPreferences(data.communication_preferences)
  } else {
    const legacy = await admin
      .from("users")
      .select("communication_preferences")
      .eq("id", user.id)
      .maybeSingle()
    const raw =
      legacy.data && "communication_preferences" in legacy.data
        ? legacy.data.communication_preferences
        : undefined
    preferences = parseCommunicationPreferences(raw)
  }

  return NextResponse.json({ preferences: preferences ?? parseCommunicationPreferences(undefined) })
}

export async function PATCH(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: PatchBody = {}
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  // Read current from user_preferences when available; otherwise fall back to legacy users column.
  let current: CommunicationPreferences = parseCommunicationPreferences(undefined)
  const prefRead = await admin
    .from("user_preferences")
    .select("communication_preferences")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!prefRead.error && prefRead.data && "communication_preferences" in prefRead.data) {
    current = parseCommunicationPreferences(prefRead.data.communication_preferences)
  } else {
    const legacy = await admin
      .from("users")
      .select("communication_preferences")
      .eq("id", user.id)
      .maybeSingle()
    if (!legacy.error && legacy.data && "communication_preferences" in legacy.data) {
      current = parseCommunicationPreferences(legacy.data.communication_preferences)
    }
  }

  const next: CommunicationPreferences = {
    productUpdates:
      typeof body.productUpdates === "boolean" ? body.productUpdates : current.productUpdates,
    securityAlerts:
      typeof body.securityAlerts === "boolean" ? body.securityAlerts : current.securityAlerts,
    marketingEmails:
      typeof body.marketingEmails === "boolean" ? body.marketingEmails : current.marketingEmails,
    channels: {
      email:
        typeof body.channels?.email === "boolean"
          ? body.channels.email
          : current.channels.email,
      push:
        typeof body.channels?.push === "boolean" ? body.channels.push : current.channels.push,
    },
  }

  // Write to user_preferences (authoritative). If table missing, still try legacy users update.
  const nowIso = new Date().toISOString()
  const prefUpsert = await admin
    .from("user_preferences")
    .upsert(
      { user_id: user.id, communication_preferences: next, updated_at: nowIso },
      { onConflict: "user_id" },
    )

  if (prefUpsert.error && prefUpsert.error.code !== "42P01") {
    console.error("communication PATCH user_preferences:", prefUpsert.error)
    return NextResponse.json({ error: prefUpsert.error.message }, { status: 500 })
  }

  // Compatibility: keep legacy column in sync when present.
  const legacyUp = await admin
    .from("users")
    .update({
      communication_preferences: next,
      updated_at: nowIso,
    })
    .eq("id", user.id)

  if (legacyUp.error && legacyUp.error.code !== "42703") {
    console.warn("communication PATCH legacy users update (non-fatal):", legacyUp.error)
  }

  await syncSendGridMarketingState(user.email ?? "", next).catch((e) =>
    console.warn("SendGrid marketing sync (optional):", e),
  )

  return NextResponse.json({ preferences: next })
}

/** Phase 2: optional Marketing Contacts / ASM sync when env is configured. */
async function syncSendGridMarketingState(_email: string, _prefs: CommunicationPreferences) {
  if (!process.env.SENDGRID_API_KEY) return
}
