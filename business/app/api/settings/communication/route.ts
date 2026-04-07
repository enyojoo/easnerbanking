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
    .from("users")
    .select("communication_preferences")
    .eq("id", user.id)
    .maybeSingle()

  if (error && error.code !== "42703") {
    console.error("communication GET:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const raw = data && "communication_preferences" in data ? data.communication_preferences : undefined
  const preferences = parseCommunicationPreferences(raw)

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
  const { data: row, error: readErr } = await admin
    .from("users")
    .select("communication_preferences")
    .eq("id", user.id)
    .maybeSingle()

  if (readErr && readErr.code !== "42703") {
    console.error("communication PATCH read:", readErr)
    return NextResponse.json({ error: readErr.message }, { status: 500 })
  }

  const current = parseCommunicationPreferences(
    row && "communication_preferences" in row ? row.communication_preferences : undefined,
  )

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

  const { error: upErr } = await admin
    .from("users")
    .update({
      communication_preferences: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)

  if (upErr) {
    if (upErr.code === "42703") {
      return NextResponse.json(
        {
          error:
            "communication_preferences column missing — apply latest Supabase migrations.",
        },
        { status: 503 },
      )
    }
    console.error("communication PATCH:", upErr)
    return NextResponse.json({ error: upErr.message }, { status: 500 })
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
