import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { validateEasetag } from "@/lib/easetag-validation"
import { isEasetagGloballyAvailable } from "@/lib/easetag-global"

/** Consumer: set Easetag (validated + globally unique vs users + businesses). */
export async function PUT(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { easetag?: string } = {}
  try {
    body = (await request.json()) as { easetag?: string }
  } catch {
    body = {}
  }

  const raw = String(body.easetag || "").trim()
  const validation = validateEasetag(raw)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error ?? "Invalid Easetag" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const clean = raw.replace(/^@/, "").toLowerCase()
  const ok = await isEasetagGloballyAvailable(admin, raw, { excludeUserId: user.id })
  if (!ok) {
    return NextResponse.json({ error: "Easetag is already taken" }, { status: 409 })
  }

  const { error } = await admin.from("users").update({ easetag: clean, updated_at: new Date().toISOString() }).eq("id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, easetag: clean })
}
