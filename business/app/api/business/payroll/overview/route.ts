import { NextResponse } from "next/server"
import { requireBusinessOrgWithRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  mapRowToPayrollPerson,
  mapRowToPayrollRun,
  mapRowToPayrollLine,
  type PayrollPersonRow,
  type PayrollRunRow,
} from "@/lib/payroll/map-payroll"
import {
  readBusinessAvailableBalance,
  computeShortfall,
  personNeedsDestination,
} from "@/lib/payroll/helpers"
import { summarizeRailMix } from "@/lib/payroll/run-utils"
import type { PayrollOverview, PayrollRail } from "@/lib/payroll/types"

export async function GET(request: Request) {
  const ctx = await requireBusinessOrgWithRole(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const sourceCurrency = "USD"

  const { data: peopleRows } = await admin
    .from("payroll_people")
    .select("*")
    .eq("business_id", ctx.businessId)

  const people = (peopleRows ?? []).map((r) => mapRowToPayrollPerson(r as PayrollPersonRow))
  const active = people.filter((p) => p.status === "active")
  const held = people.filter((p) => p.status === "held")
  const needsDestination = active.filter((p) =>
    personNeedsDestination({ rail: p.rail, recipientId: p.recipientId, easetag: p.easetag }),
  )

  const estimatedTotal = active.reduce((sum, p) => sum + p.defaultAmount, 0)
  const availableBalance = await readBusinessAvailableBalance(admin, ctx.businessId, sourceCurrency)
  const shortfall = computeShortfall(estimatedTotal, availableBalance)

  const { data: scheduleRow } = await admin
    .from("payroll_schedules")
    .select("next_run_at")
    .eq("business_id", ctx.businessId)
    .eq("active", true)
    .order("next_run_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: draftRun } = await admin
    .from("payroll_runs")
    .select("id")
    .eq("business_id", ctx.businessId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: pendingRun } = await admin
    .from("payroll_runs")
    .select("id")
    .eq("business_id", ctx.businessId)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: recentRunRows } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })
    .limit(5)

  const railMix = summarizeRailMix(active.map((p) => ({ rail: p.rail }))) as Record<
    PayrollRail,
    number
  >

  const overview: PayrollOverview = {
    nextPayday: scheduleRow?.next_run_at ?? null,
    estimatedTotal,
    sourceCurrency,
    headcount: people.length,
    activeCount: active.length,
    heldCount: held.length,
    needsDestinationCount: needsDestination.length,
    funded: shortfall <= 0,
    shortfall,
    availableBalance,
    railMix,
    draftRunId: draftRun?.id ?? null,
    pendingApprovalRunId: pendingRun?.id ?? null,
    recentRuns: (recentRunRows ?? []).map((r) => mapRowToPayrollRun(r as PayrollRunRow)),
  }

  return NextResponse.json({ overview })
}
