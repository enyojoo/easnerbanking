import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { isUndefinedEasetagColumnError } from "@/lib/easetag-global"
import { enforcePayrollRateLimit } from "@/lib/payroll/rate-limit"

/**
 * Authenticated lookup of another party's public Easetag profile (user or business).
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
  if (!(await enforcePayrollRateLimit(admin, `easetag_lookup:${user.id}`, {
    limit: 60,
    windowSeconds: 60,
  }))) {
    return NextResponse.json({ error: "Too many EASETAG lookups. Try again shortly." }, { status: 429 })
  }

  const { data: me, error: meErr } = await admin
    .from("users")
    .select("id,easner_business_id")
    .eq("id", user.id)
    .maybeSingle()

  if (meErr) {
    return NextResponse.json({ error: meErr.message }, { status: 400 })
  }

  const myBusinessId = (me?.easner_business_id as string | null | undefined) ?? null

  const { data: userRow, error: uerr } = await admin
    .from("users")
    .select("id,easetag,full_name,avatar_url,noah_kyc_status")
    .eq("easetag", clean)
    .maybeSingle()

  if (uerr && !isUndefinedEasetagColumnError(uerr)) {
    return NextResponse.json({ error: uerr.message }, { status: 400 })
  }

  const resolvedUserRow = uerr && isUndefinedEasetagColumnError(uerr) ? null : userRow

  if (resolvedUserRow) {
    if (excludeSelf && resolvedUserRow.id === user.id) {
      return NextResponse.json({ ok: true, found: false, reason: "self" }, { status: 200 })
    }
    return NextResponse.json({
      ok: true,
      found: true,
      easetag: resolvedUserRow.easetag as string,
      fullName: String(resolvedUserRow.full_name || "").trim() || clean,
      avatarUrl: (resolvedUserRow.avatar_url as string | null) || null,
      accountKind: "personal" as const,
      verified: resolvedUserRow.noah_kyc_status === "approved",
    })
  }

  const { data: bizRow, error: berr } = await admin
    .from("businesses")
    .select("id,easetag,name,logo_url,noah_kyb_status")
    .eq("easetag", clean)
    .maybeSingle()

  if (berr) {
    return NextResponse.json({ error: berr.message }, { status: 400 })
  }

  if (bizRow) {
    if (excludeSelf && myBusinessId && bizRow.id === myBusinessId) {
      return NextResponse.json({ ok: true, found: false, reason: "self" }, { status: 200 })
    }
    return NextResponse.json({
      ok: true,
      found: true,
      easetag: bizRow.easetag as string,
      fullName: String(bizRow.name || "").trim() || clean,
      avatarUrl: (bizRow.logo_url as string | null) || null,
      accountKind: "business" as const,
      verified: bizRow.noah_kyb_status === "approved",
    })
  }

  return NextResponse.json({ ok: true, found: false }, { status: 200 })
}
