import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { sendSecurityAlertEmail } from "@/lib/notifications/security-notify"
import type { SecurityAlertEmailData } from "@easner/server"

const ALLOWED: SecurityAlertEmailData["alertType"][] = [
  "password_changed",
  "mfa_enabled",
  "mfa_disabled",
]

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { alertType?: string; deviceLabel?: string } = {}
  try {
    body = (await request.json()) as { alertType?: string; deviceLabel?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const alertType = body.alertType as SecurityAlertEmailData["alertType"]
  if (!ALLOWED.includes(alertType)) {
    return NextResponse.json({ error: "Invalid alertType" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  await sendSecurityAlertEmail(admin, {
    userId: user.id,
    userEmail: user.email,
    alertType,
    deviceLabel: body.deviceLabel,
  })

  return NextResponse.json({ ok: true })
}
