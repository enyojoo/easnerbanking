import { NextResponse } from "next/server"
import {
  parseCommunicationPreferences,
  DEFAULT_COMMUNICATION_PREFERENCES,
  type CommunicationPreferences,
} from "@easner/shared"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { ensureDefaultCommunicationPreferences } from "@/lib/notifications/ensure-communication-preferences"

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

  // Missing table/column → treat as “no row yet” (defaults).
  if (error && error.code !== "42P01" && error.code !== "42703") {
    console.error("communication GET:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    await ensureDefaultCommunicationPreferences(admin, user.id)
    return NextResponse.json({ preferences: { ...DEFAULT_COMMUNICATION_PREFERENCES, channels: { ...DEFAULT_COMMUNICATION_PREFERENCES.channels } } })
  }

  const preferences =
    "communication_preferences" in data
      ? parseCommunicationPreferences(data.communication_preferences)
      : parseCommunicationPreferences(undefined)

  return NextResponse.json({ preferences })
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
  let current: CommunicationPreferences = parseCommunicationPreferences(undefined)
  const prefRead = await admin
    .from("user_preferences")
    .select("communication_preferences")
    .eq("user_id", user.id)
    .maybeSingle()
  if (
    prefRead.error &&
    prefRead.error.code !== "42P01" &&
    prefRead.error.code !== "42703"
  ) {
    console.error("communication PATCH read:", prefRead.error)
    return NextResponse.json({ error: prefRead.error.message }, { status: 500 })
  }
  if (!prefRead.error && prefRead.data && "communication_preferences" in prefRead.data) {
    current = parseCommunicationPreferences(prefRead.data.communication_preferences)
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

  await syncSendGridMarketingState(user.email ?? "", next).catch((e) =>
    console.warn("SendGrid marketing sync (optional):", e),
  )

  return NextResponse.json({ preferences: next })
}

/** Phase 2: optional Marketing Contacts / ASM sync when env is configured. */
async function syncSendGridMarketingState(_email: string, _prefs: CommunicationPreferences) {
  if (!process.env.SENDGRID_API_KEY) return
}
