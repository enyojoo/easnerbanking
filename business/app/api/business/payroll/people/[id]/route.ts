import { NextResponse } from "next/server"
import { requireBusinessOrgWithRole, requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollPerson,
  payrollPersonToDbPayload,
  type PayrollPersonRow,
} from "@/lib/payroll/map-payroll"
import type { PayrollPersonInput } from "@/lib/payroll/types"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessOrgWithRole(request)
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

  return NextResponse.json({ person: mapRowToPayrollPerson(data as PayrollPersonRow) })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin", "Member"])
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
  return NextResponse.json({ person: mapRowToPayrollPerson(data as PayrollPersonRow) })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin"])
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
