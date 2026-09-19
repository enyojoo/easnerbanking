import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { sendDestinationFromRow } from "@/lib/send-destination"

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
    .select("id")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (personError) {
    return NextResponse.json({ error: personError.message }, { status: 500 })
  }
  if (!person) {
    return NextResponse.json({ error: "Payroll person not found." }, { status: 404 })
  }
  const { data: payrollMethod, error: methodError } = await admin
    .from("payroll_payment_methods")
    .select("id,type,full_name,country_code,currency,account_number,bank_name,phone_number,email,mobile_provider,wallet_network,routing_number,sort_code,iban,swift_bic,transfer_type,checking_or_savings,address_line1,city,state,postal_code,metadata")
    .eq("person_id", id)
    .eq("business_id", ctx.businessId)
    .eq("owner_type", "business")
    .eq("status", "active")
    .maybeSingle()
  if (methodError) {
    return NextResponse.json({ error: methodError.message }, { status: 500 })
  }
  if (payrollMethod?.account_number) {
    try {
      const destination = sendDestinationFromRow(payrollMethod, "payroll_method")
      return NextResponse.json(
        {
          recipient: {
            ...destination,
            user_id: ctx.userId,
            metadata: {
              ...(destination.metadata ?? {}),
              payrollOwned: true,
            },
          },
        },
        { headers: { "Cache-Control": "private, no-store" } },
      )
    } catch {
      return NextResponse.json(
        { error: "The saved receiving method could not be loaded." },
        { status: 500 },
      )
    }
  }
  return NextResponse.json(
    { error: "This person does not have Payroll-owned payment details." },
    { status: 404 },
  )
}
