import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe/client"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/**
 * Submit dispute evidence. The merchant writes their side in plain fields; the
 * platform (as merchant of record) files it with the processor. `submit: false`
 * saves a draft on the dispute without filing.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as {
    product_description?: string
    customer_email_address?: string
    customer_name?: string
    uncategorized_text?: string
    submit?: boolean
  } | null

  const admin = createSupabaseAdmin()
  const { data: dispute } = await admin
    .from("checkout_disputes")
    .select("id, status, evidence_submitted_at")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!dispute?.id) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 })
  }
  if (dispute.evidence_submitted_at) {
    return NextResponse.json({ error: "Evidence was already submitted" }, { status: 409 })
  }

  const evidence: Record<string, string> = {}
  for (const key of [
    "product_description",
    "customer_email_address",
    "customer_name",
    "uncategorized_text",
  ] as const) {
    const value = String(body?.[key] ?? "").trim()
    if (value) evidence[key] = value.slice(0, 20000)
  }
  if (Object.keys(evidence).length === 0) {
    return NextResponse.json({ error: "Write at least one evidence field" }, { status: 400 })
  }

  const submit = body?.submit !== false
  try {
    const updated = await getStripe().disputes.update(id, {
      evidence,
      submit,
    })
    const now = new Date().toISOString()
    await admin
      .from("checkout_disputes")
      .update({
        status: updated.status,
        ...(submit ? { evidence_submitted_at: now } : {}),
        updated_at: now,
      })
      .eq("id", id)
    return NextResponse.json({ ok: true, status: updated.status, submitted: submit })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not submit evidence"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
