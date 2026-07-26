import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { encryptPayrollMethodDetails, maskPayrollMethodDetails } from "@/lib/payroll/payment-method-security"
import { resolvePayrollRecipientMethod } from "@/lib/payroll/recipient-method"
import { replaceEmployeePayrollMethod } from "@/lib/payroll/replace-employee-payment-method"

type MethodType = "bank" | "mobile_money" | "stablecoin"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    type?: MethodType
    label?: string
    details?: Record<string, string>
    providerRecipientId?: string
  }
  if (!body.type || !["bank", "mobile_money", "stablecoin"].includes(body.type)) {
    return NextResponse.json({ error: "Invalid receiving method" }, { status: 400 })
  }
  const admin = createSupabaseAdmin()
  const { data: invitation } = await admin
    .from("payroll_connection_invitations")
    .select("*")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle()
  if (!invitation || String(invitation.email).toLowerCase() !== String(auth.user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 410 })
  }
  const resolved = body.providerRecipientId
    ? await resolvePayrollRecipientMethod(admin, {
        recipientId: body.providerRecipientId,
        userId: auth.user.id,
        expectedType: body.type,
      })
    : null
  const details = resolved?.details ?? body.details ?? {}
  const complete =
    body.type === "bank"
      ? details.bankName?.trim() && details.accountNumber?.trim()
      : body.type === "mobile_money"
        ? details.provider?.trim() && details.phoneNumber?.trim()
        : details.network?.trim() && details.walletAddress?.trim()
  if (!complete || (body.providerRecipientId && !resolved)) {
    return NextResponse.json({ error: "Complete and verify this receiving method in Send" }, { status: 400 })
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
  try {
    const method = await replaceEmployeePayrollMethod(admin, {
      connectionId: String(invitation.connection_id),
      personId: String(invitation.person_id),
      businessId: String(invitation.business_id),
      selectAsPreferred: false,
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
    return NextResponse.json({ method })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save receiving method" },
      { status: 500 },
    )
  }
}
