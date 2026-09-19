import { NextResponse } from "next/server"
import { requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

async function resolveApproval(id: string, businessId: string) {
  const admin = createSupabaseAdmin()
  const { data } = await admin
    .from("business_approvals")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle()
  return { admin, row: data }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; decision: string }> },
) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin"])
  if (!ctx.ok) return ctx.response

  const { id, decision } = await params
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string }
  const { admin, row } = await resolveApproval(id, ctx.businessId)
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const newStatus = decision === "approve" ? "approved" : "rejected"
  await admin
    .from("business_approvals")
    .update({
      status: newStatus,
      memo: body.reason ? String(body.reason) : row.memo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (decision === "reject" && row.subject_type === "payroll_run") {
    await admin
      .from("payroll_runs")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", row.subject_id)
  }

  return NextResponse.json({
    approval: {
      id: String(row.id),
      status: newStatus,
      amount: Number(row.amount_cents ?? 0) / 100,
      currency: String(row.currency || "USD"),
      requester_id: String(row.requester_id),
      created_at: String(row.created_at),
      updated_at: new Date().toISOString(),
      subject_type: row.subject_type,
      subject_id: String(row.subject_id),
      memo: body.reason ?? (row.memo as string | null),
    },
  })
}
