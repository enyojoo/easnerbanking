import { NextResponse } from "next/server"
import { requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { emailService } from "@easner/server"
import { mapRowToPayrollPerson, type PayrollPersonRow } from "@/lib/payroll/map-payroll"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin", "Member"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()

  const { data: personRow } = await admin
    .from("payroll_people")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!personRow) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const person = mapRowToPayrollPerson(personRow as PayrollPersonRow)
  if (!person.email?.trim()) {
    return NextResponse.json({ error: "Person has no email address" }, { status: 400 })
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("name,easetag")
    .eq("id", ctx.businessId)
    .maybeSingle()

  const businessName = String(biz?.name || "Your employer")
  const mobileUrl =
    process.env.NEXT_PUBLIC_MOBILE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.easner.com"

  try {
    await emailService.sendEmail({
      to: person.email.trim(),
      template: "payrollEasetagInvite",
      audience: "personal",
      data: {
        recipientName: person.fullName,
        businessName,
        signupUrl: mobileUrl,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send invite"
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
