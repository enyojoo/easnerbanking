import { NextResponse } from "next/server"
import { createBusinessAppSession } from "@/lib/app-session"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type SessionBody = {
  accessToken?: string
}

export async function POST(request: Request) {
  let body: SessionBody = {}
  try {
    body = (await request.json()) as SessionBody
  } catch {
    body = {}
  }

  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : ""
  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin.auth.getUser(accessToken)
  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const session = createBusinessAppSession(data.user)
  return NextResponse.json(session)
}
