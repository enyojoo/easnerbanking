import { NextResponse } from "next/server"
import { requireBusinessOrgWithRole, requireBusinessRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollPerson,
  payrollPersonToDbPayload,
  type PayrollPersonRow,
} from "@/lib/payroll/map-payroll"
import type { PayrollPersonInput } from "@/lib/payroll/types"

export async function GET(request: Request) {
  const ctx = await requireBusinessOrgWithRole(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("payroll_people")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("full_name", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const people = (data ?? []).map((row) => mapRowToPayrollPerson(row as PayrollPersonRow))
  return NextResponse.json({ people })
}

export async function POST(request: Request) {
  const ctx = await requireBusinessRole(request, ["Owner", "Admin", "Member"])
  if (!ctx.ok) return ctx.response

  let body: PayrollPersonInput
  try {
    body = (await request.json()) as PayrollPersonInput
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.fullName?.trim()) {
    return NextResponse.json({ error: "fullName is required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const payload = payrollPersonToDbPayload({
    businessId: ctx.businessId,
    person: {
      type: body.type,
      fullName: body.fullName,
      email: body.email ?? null,
      country: body.country ?? null,
      defaultAmount: body.defaultAmount ?? 0,
      payCurrency: body.payCurrency ?? "USD",
      payBasis: body.payBasis ?? "fixed",
      hourlyRate: body.hourlyRate ?? null,
      recipientId: body.recipientId ?? null,
      easetag: body.easetag ?? null,
      rail: body.rail,
      status: body.status ?? "active",
    },
  })

  const { data, error } = await admin.from("payroll_people").insert(payload).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ person: mapRowToPayrollPerson(data as PayrollPersonRow) })
}
