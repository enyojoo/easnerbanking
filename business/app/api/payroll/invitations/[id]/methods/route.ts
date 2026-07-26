import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { replaceEmployeePayrollMethod } from "@/lib/payroll/replace-employee-payment-method"
import { payrollMethodDbPayload } from "@/lib/send-destination"
import { payrollMethodDetails } from "@/lib/payroll/personal-payroll"

type MethodType = "bank" | "mobile_money" | "stablecoin"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    type?: MethodType
    label?: string
    details?: Record<string, string>
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
  const details = body.details ?? {}
  const complete =
    body.type === "bank"
      ? details.bankName?.trim() && details.accountNumber?.trim()
      : body.type === "mobile_money"
        ? details.provider?.trim() && details.phoneNumber?.trim()
        : details.network?.trim() && details.walletAddress?.trim()
  if (!complete) {
    return NextResponse.json({ error: "Complete and verify this receiving method" }, { status: 400 })
  }

  try {
    const method = await replaceEmployeePayrollMethod(admin, {
      connectionId: String(invitation.connection_id),
      personId: String(invitation.person_id),
      businessId: String(invitation.business_id),
      selectAsPreferred: false,
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
    return NextResponse.json({
      method: {
        ...method,
        details: payrollMethodDetails(method as unknown as Record<string, unknown>),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save receiving method" },
      { status: 500 },
    )
  }
}
