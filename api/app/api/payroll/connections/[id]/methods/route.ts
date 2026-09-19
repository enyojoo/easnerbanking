import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { syncPayrollPersonReceivingMethod } from "@/lib/payroll/sync-person-receiving-method"
import { replaceEmployeePayrollMethod } from "@/lib/payroll/replace-employee-payment-method"
import { payrollMethodDbPayload } from "@/lib/send-destination"
import { payrollMethodDetails } from "@/lib/payroll/personal-payroll"

type ExternalMethodType = "bank" | "mobile_money" | "stablecoin"

function validateDetails(type: ExternalMethodType, details: Record<string, string>): string | null {
  if (type === "bank" && (!details.bankName?.trim() || !details.accountNumber?.trim())) {
    return "Bank name and account number are required"
  }
  if (type === "mobile_money" && (!details.provider?.trim() || !details.phoneNumber?.trim())) {
    return "Provider and phone number are required"
  }
  if (type === "stablecoin" && (!details.network?.trim() || !details.walletAddress?.trim())) {
    return "Network and wallet address are required"
  }
  return null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    type?: ExternalMethodType
    label?: string
    details?: Record<string, string>
    preferred?: boolean
  }
  if (!body.type || !["bank", "mobile_money", "stablecoin"].includes(body.type)) {
    return NextResponse.json({ error: "Invalid receiving method" }, { status: 400 })
  }
  const admin = createSupabaseAdmin()
  const { data: connection } = await admin
    .from("payroll_connections")
    .select("business_id,person_id,status")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle()
  if (!connection || connection.status !== "approved") {
    return NextResponse.json({ error: "Approved connection not found" }, { status: 404 })
  }
  const details = body.details ?? {}
  const validation = validateDetails(body.type, details)
  if (validation) return NextResponse.json({ error: validation }, { status: 400 })
  let method
  try {
    method = await replaceEmployeePayrollMethod(admin, {
      connectionId: id,
      personId: String(connection.person_id),
      businessId: String(connection.business_id),
      selectAsPreferred: body.preferred !== false,
      type: body.type,
      label:
        body.label?.trim() ||
        (body.type === "bank"
          ? details.bankName
          : body.type === "mobile_money"
            ? details.provider
            : `${details.network} wallet`),
      destination: payrollMethodDbPayload(body.type, details),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save receiving method" },
      { status: 500 },
    )
  }
  if (body.preferred !== false) {
    await syncPayrollPersonReceivingMethod(admin, id)
  }
  await admin.from("payroll_run_events").insert({
    business_id: connection.business_id,
    person_id: connection.person_id,
    actor_user_id: auth.user.id,
    event_type: "connection.method_changed",
    data: { methodId: method.id, type: body.type },
  })
  return NextResponse.json({
    method: {
      ...method,
      details: payrollMethodDetails(method as unknown as Record<string, unknown>),
    },
  })
}
