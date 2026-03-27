import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") || undefined

  const admin = createSupabaseAdmin()
  let q = admin.from("kyc_submissions").select("*").order("created_at", { ascending: false })
  if (status && status !== "all") {
    q = q.eq("status", status)
  }
  const { data, error } = await q
  if (error) {
    console.error("admin kyc list:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ submissions: data ?? [] })
}

export async function PATCH(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  let body: { submissionId?: string; status?: string; rejectionReason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const submissionId = body.submissionId
  const status = body.status as "in_review" | "approved" | "rejected" | undefined
  if (!submissionId || !status) {
    return NextResponse.json({ error: "submissionId and status required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const update: Record<string, unknown> = {
    status,
    reviewed_by: auth.ctx.userId,
    reviewed_at: new Date().toISOString(),
  }
  if (status === "rejected" && body.rejectionReason) {
    update.rejection_reason = body.rejectionReason
  }

  const { data, error } = await admin
    .from("kyc_submissions")
    .update(update)
    .eq("id", submissionId)
    .select()
    .single()

  if (error) {
    console.error("admin kyc patch:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction(auth.ctx.userId, "kyc.submission_update", submissionId, { status })

  return NextResponse.json({ submission: data })
}
