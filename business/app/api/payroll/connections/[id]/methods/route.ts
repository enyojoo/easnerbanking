import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { encryptPayrollMethodDetails, maskPayrollMethodDetails } from "@/lib/payroll/payment-method-security"
import { syncPayrollPersonReceivingMethod } from "@/lib/payroll/sync-person-receiving-method"
import { resolvePayrollRecipientMethod } from "@/lib/payroll/recipient-method"
import { replaceEmployeePayrollMethod } from "@/lib/payroll/replace-employee-payment-method"

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
    providerRecipientId?: string
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
  const resolved = body.providerRecipientId
    ? await resolvePayrollRecipientMethod(admin, {
        recipientId: body.providerRecipientId,
        userId: auth.user.id,
        expectedType: body.type,
      })
    : null
  const details = resolved?.details ?? body.details ?? {}
  const validation = validateDetails(body.type, details)
  if (validation || (body.providerRecipientId && !resolved)) {
    return NextResponse.json(
      {
        error: body.providerRecipientId ? "Complete and verify this receiving method in Send" : validation,
      },
      { status: 400 },
    )
  }
  let encryptedDetails: string
  try {
    encryptedDetails = encryptPayrollMethodDetails(details)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Encryption unavailable",
      },
      { status: 503 },
    )
  }
  let method
  try {
    method = await replaceEmployeePayrollMethod(admin, {
      connectionId: id,
      personId: String(connection.person_id),
      businessId: String(connection.business_id),
      selectAsPreferred: body.preferred !== false,
      type: body.type,
      label:
        resolved?.label ||
        body.label?.trim() ||
        (body.type === "bank"
          ? details.bankName
          : body.type === "mobile_money"
            ? details.provider
            : `${details.network} wallet`),
      maskedDetails: maskPayrollMethodDetails(body.type, details),
      encryptedDetails,
      providerRecipientId: resolved?.providerRecipientId ?? null,
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
  return NextResponse.json({ method })
}
