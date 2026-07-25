import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollPerson,
  payrollPersonToDbPayload,
  type PayrollPersonRow,
} from "@/lib/payroll/map-payroll"
import type { PayrollPersonInput } from "@/lib/payroll/types"
import { maskPayrollMethod } from "@/lib/payroll/personal-payroll"
import { buildPayrollLines } from "@/lib/payroll/build-lines"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("payroll_people")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [{ data: connection }, { data: lines }, { data: events }] = await Promise.all([
    admin.from("payroll_connections")
      .select("id,status,approved_at,declined_at,revoked_at,preferred_method_id,payroll_payment_methods(id,type,label,masked_details,status)")
      .eq("person_id", id)
      .maybeSingle(),
    admin.from("payroll_lines")
      .select("id,run_id,amount_cents,pay_currency,status,settled_at,payroll_documents(id,type,status,filename,generated_at)")
      .eq("person_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("payroll_run_events")
      .select("id,event_type,data,created_at,actor_user_id")
      .eq("person_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ])
  const methods = (
    (connection?.payroll_payment_methods as Array<Record<string, unknown>> | null) ?? []
  ).filter((method) => method.status === "active")
  return NextResponse.json({
    person: mapRowToPayrollPerson(data as PayrollPersonRow),
    connection: connection ? {
      id: connection.id,
      status: connection.status,
      approvedAt: connection.approved_at,
      declinedAt: connection.declined_at,
      revokedAt: connection.revoked_at,
      preferredMethod: methods
        .filter((method) => String(method.id) === String(connection.preferred_method_id))
        .map((method) => ({
          id: method.id,
          type: method.type,
          label: method.label,
          maskedDetails: maskPayrollMethod(method),
        }))[0] ?? null,
    } : null,
    paymentHistory: (lines ?? []).map((line) => ({
      id: line.id,
      runId: line.run_id,
      amount: Number(line.amount_cents ?? 0) / 100,
      currency: line.pay_currency,
      status: line.status,
      settledAt: line.settled_at,
      documents: line.payroll_documents ?? [],
    })),
    events: events ?? [],
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  let body: Partial<PayrollPersonInput>
  try {
    body = (await request.json()) as Partial<PayrollPersonInput>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: existing } = await admin
    .from("payroll_people")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const current = mapRowToPayrollPerson(existing as PayrollPersonRow)
  const payload = payrollPersonToDbPayload({
    businessId: ctx.businessId,
    person: {
      type: body.type ?? current.type,
      fullName: body.fullName ?? current.fullName,
      email: body.email !== undefined ? body.email : current.email,
      country: body.country !== undefined ? body.country : current.country,
      defaultAmount: body.defaultAmount ?? current.defaultAmount,
      payCurrency: body.payCurrency ?? current.payCurrency,
      payBasis: body.payBasis ?? current.payBasis,
      hourlyRate: body.hourlyRate !== undefined ? body.hourlyRate : current.hourlyRate,
      recipientId: body.recipientId !== undefined ? body.recipientId : current.recipientId,
      easetag: body.easetag !== undefined ? body.easetag : current.easetag,
      rail: body.rail ?? current.rail,
      status: (body as { status?: typeof current.status }).status ?? current.status,
    },
  })

  const { data, error } = await admin
    .from("payroll_people")
    .update(payload)
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const person = mapRowToPayrollPerson(data as PayrollPersonRow)
  const [draftLine] = await buildPayrollLines(admin, "draft-sync", [person])
  const { data: drafts } = await admin.from("payroll_runs")
    .select("id").eq("business_id", ctx.businessId).eq("status", "draft")
  const draftIds = (drafts ?? []).map((run) => String(run.id))
  if (draftLine && draftIds.length > 0) {
    await admin.from("payroll_lines").update({
      recipient_snapshot: draftLine.recipient_snapshot,
      amount_cents: draftLine.amount_cents,
      pay_currency: draftLine.pay_currency,
      rail: draftLine.rail,
      recipient_id: draftLine.recipient_id,
      payment_method_id: draftLine.payment_method_id,
      payment_method_snapshot: draftLine.payment_method_snapshot,
      metadata: draftLine.metadata,
      updated_at: new Date().toISOString(),
    }).eq("person_id", id).in("run_id", draftIds)
  }
  await admin.from("payroll_run_events").insert({
    business_id: ctx.businessId,
    person_id: id,
    actor_user_id: ctx.userId,
    event_type: "person.updated",
    data: { affectedDraftRuns: draftIds },
  })
  return NextResponse.json({ person })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const admin = createSupabaseAdmin()

  const { error } = await admin
    .from("payroll_people")
    .delete()
    .eq("id", id)
    .eq("business_id", ctx.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
