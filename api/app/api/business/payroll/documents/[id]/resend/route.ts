import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { sendPayrollStubForLine } from "@/lib/payroll/send-stub-email"
import { enforcePayrollRateLimit } from "@/lib/payroll/rate-limit"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response
  const { id } = await params
  const admin = createSupabaseAdmin()
  if (!(await enforcePayrollRateLimit(admin, `payroll_resend:${ctx.businessId}:${id}`, {
    limit: 10,
    windowSeconds: 3600,
  }))) {
    return NextResponse.json({ error: "Too many resend attempts. Try again later." }, { status: 429 })
  }
  const { data: document } = await admin.from("payroll_documents")
    .select("run_id,line_id").eq("id", id).eq("business_id", ctx.businessId).maybeSingle()
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 })
  try {
    await sendPayrollStubForLine(
      admin,
      ctx.businessId,
      String(document.run_id),
      String(document.line_id),
      { forceEmail: true },
    )
    await admin.from("payroll_run_events").insert({
      business_id: ctx.businessId,
      run_id: document.run_id,
      actor_user_id: ctx.userId,
      event_type: "document.email_resent",
      data: { documentId: id, lineId: document.line_id },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not resend pay stub",
    }, { status: 500 })
  }
}
