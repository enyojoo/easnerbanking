import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { normalizeEasetag } from "@/lib/easetag-validation"

/**
 * Authenticated lookup of another user's public Easenet profile (for add-recipient preview).
 * Does not expose email, phone, or Noah ids.
 */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const raw = url.searchParams.get("easetag") || ""
  const clean = normalizeEasetag(raw)
  if (!clean) {
    return NextResponse.json({ ok: true, found: false }, { status: 200 })
  }

  const excludeSelf = url.searchParams.get("excludeSelf") !== "false"

  const admin = createSupabaseAdmin()
  const { data: row, error } = await admin
    .from("users")
    .select("id,easetag,full_name,avatar_url")
    .eq("easetag", clean)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!row) {
    return NextResponse.json({ ok: true, found: false }, { status: 200 })
  }
  if (excludeSelf && row.id === user.id) {
    return NextResponse.json({ ok: true, found: false, reason: "self" }, { status: 200 })
  }

  return NextResponse.json({
    ok: true,
    found: true,
    easetag: row.easetag as string,
    fullName: String(row.full_name || "").trim() || clean,
    avatarUrl: (row.avatar_url as string | null) || null,
  })
}
