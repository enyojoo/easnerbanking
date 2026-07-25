import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolvePayrollInvitation } from "@/lib/payroll/personal-payroll"
import { enforcePayrollRateLimit } from "@/lib/payroll/rate-limit"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const body = (await request.json().catch(() => ({}))) as { token?: string }
  const token = body.token?.trim()
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 })

  const admin = createSupabaseAdmin()
  if (!(await enforcePayrollRateLimit(admin, `payroll_resolve:${auth.user.id}`, {
    limit: 20,
    windowSeconds: 900,
  }))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 })
  }
  const result = await resolvePayrollInvitation(admin, auth.user, token)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  })
}
