import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { enforcePayrollRateLimit } from "@/lib/payroll/rate-limit"
import { isBusinessTier1Complete as isBusinessTier1CompleteFromRow } from "@/lib/compliance/business-tier1"

/**
 * Payroll-only EASETAG lookup.
 *
 * Unlike the general public profile lookup, this may return the account email
 * because Payroll needs it to deliver the connection request. Access is limited
 * to Payroll preparers/approvers and remains rate-limited.
 */
export async function GET(request: Request) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const easetag = normalizeEasetag(new URL(request.url).searchParams.get("easetag") || "")
  if (!easetag) return NextResponse.json({ found: false })

  const admin = createSupabaseAdmin()
  if (!(await enforcePayrollRateLimit(admin, `payroll_easetag_lookup:${ctx.userId}`, {
    limit: 60,
    windowSeconds: 60,
  }))) {
    return NextResponse.json(
      { error: "Too many EASETAG lookups. Try again shortly." },
      { status: 429 },
    )
  }

  const { data: profile, error } = await admin
    .from("users")
    .select("id,easetag,full_name,email,avatar_url,noah_kyc_status")
    .eq("easetag", easetag)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (profile) {
    if (profile.id === ctx.userId) {
      return NextResponse.json({ found: false, reason: "self" })
    }
    return NextResponse.json({
      found: true,
      easetag: String(profile.easetag || easetag),
      fullName: String(profile.full_name || easetag),
      email: String(profile.email || "").trim().toLowerCase() || null,
      avatarUrl: profile.avatar_url ?? null,
      accountKind: "personal",
      verified: profile.noah_kyc_status === "approved",
    })
  }

  const { data: business, error: businessError } = await admin
    .from("businesses")
    .select("easetag,name,logo_url,verification_status")
    .eq("easetag", easetag)
    .maybeSingle()
  if (businessError) {
    return NextResponse.json({ error: businessError.message }, { status: 500 })
  }
  if (!business) return NextResponse.json({ found: false })

  return NextResponse.json({
    found: true,
    easetag: String(business.easetag || easetag),
    fullName: String(business.name || easetag),
    email: null,
    avatarUrl: business.logo_url ?? null,
    accountKind: "business",
    verified: isBusinessTier1CompleteFromRow(business),
  })
}
