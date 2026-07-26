import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()
  const { data: person, error: personError } = await admin
    .from("payroll_people")
    .select("recipient_id")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (personError) {
    return NextResponse.json({ error: personError.message }, { status: 500 })
  }
  if (!person) {
    return NextResponse.json({ error: "Payroll person not found." }, { status: 404 })
  }
  if (!person.recipient_id) {
    return NextResponse.json(
      { error: "This person does not have a saved receiving method." },
      { status: 404 },
    )
  }

  const { data: recipient, error: recipientError } = await admin
    .from("recipients")
    .select("*")
    .eq("id", person.recipient_id)
    .maybeSingle()

  if (recipientError) {
    return NextResponse.json({ error: recipientError.message }, { status: 500 })
  }
  if (!recipient) {
    return NextResponse.json(
      { error: "The saved receiving method could not be found." },
      { status: 404 },
    )
  }

  return NextResponse.json(
    { recipient },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
