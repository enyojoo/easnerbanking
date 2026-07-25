import { NextResponse } from "next/server"
import { requireBusinessOrgWithRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { ApprovalStatus } from "@easner/shared"

export async function GET(request: Request) {
  const ctx = await requireBusinessOrgWithRole(request)
  if (!ctx.ok) return ctx.response

  const url = new URL(request.url)
  const status = (url.searchParams.get("status") || "open") as ApprovalStatus

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("business_approvals")
    .select("*")
    .eq("business_id", ctx.businessId)
    .eq("status", status)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const approvals = (data ?? []).map((row) => ({
    id: String(row.id),
    status: row.status as ApprovalStatus,
    amount: Number(row.amount_cents ?? 0) / 100,
    currency: String(row.currency || "USD"),
    requester_id: String(row.requester_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    subject_type: row.subject_type as "transfer" | "payout" | "invoice" | "card" | "payroll_run",
    subject_id: String(row.subject_id),
    memo: row.memo as string | null,
  }))

  return NextResponse.json({ approvals })
}
