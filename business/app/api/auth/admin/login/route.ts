import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Office staff login (same Supabase project). Session is only returned if user is in admin_users (active).
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    return NextResponse.json({ error: "Server misconfigured (Supabase URL/anon key)" }, { status: 500 })
  }

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = body.email?.trim()
  const password = body.password
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 })
  }

  const supabase = createClient(url, anon)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    return NextResponse.json({ error: error?.message || "Invalid credentials" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const { data: row } = await admin.from("admin_users").select("id,status").eq("id", data.user.id).maybeSingle()
  if (!row || row.status !== "active") {
    await admin.auth.admin.signOut(data.session.access_token, "global")
    return NextResponse.json({ error: "Not an office admin" }, { status: 403 })
  }

  return NextResponse.json({ success: true, session: data.session })
}
