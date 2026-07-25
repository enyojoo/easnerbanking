import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
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
import type { PayrollAttentionItem, PayrollOverview, PayrollRail } from "@/lib/payroll/types"

export async function GET(request: Request) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
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
  const attentionItems: PayrollAttentionItem[] = []
  const pendingConnections = people.filter((p) => p.connectionStatus === "pending").length
  if (pendingConnections > 0) attentionItems.push({
    code: "pending_invitations",
    severity: "info",
    title: `${pendingConnections} payroll ${pendingConnections === 1 ? "request is" : "requests are"} awaiting approval`,
    description: "Resend a request or review the person’s connection status.",
    actionLabel: "Review people",
    actionHref: "/payroll/people?status=awaiting",
  })
  if (needsDestination.length > 0) attentionItems.push({
    code: "missing_receiving_method",
    severity: "critical",
    title: `${needsDestination.length} ${needsDestination.length === 1 ? "person needs" : "people need"} a receiving method`,
    description: "Add payment details before including them in a payroll run.",
    actionLabel: "Resolve",
    actionHref: "/payroll/people?status=attention",
  })
  if (shortfall > 0) attentionItems.push({
    code: "funding_shortfall",
    severity: "critical",
    title: "Estimated payroll is not fully funded",
    description: `${sourceCurrency} ${shortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} more is needed for your active people.`,
    actionLabel: "View accounts",
    actionHref: "/accounts",
  })
  if (pendingRun?.id) attentionItems.push({
    code: "pending_approval",
    severity: "warning",
    title: "A payroll run is waiting for approval",
    description: "Review the approved payroll details and funding before payment.",
    actionLabel: "Review run",
    actionHref: `/payroll/runs/${pendingRun.id}`,
  })
  for (const row of recentRunRows ?? []) {
    if (row.status === "partial" || row.status === "failed") attentionItems.push({
      code: `run_${row.status}`,
      severity: "critical",
      title: row.status === "partial" ? "A payroll run was partially paid" : "A payroll run failed",
      description: "Review payment results and retry eligible failures.",
      actionLabel: "View run",
      actionHref: `/payroll/runs/${row.id}`,
    })
  }

  const overview: PayrollOverview = {
    nextPayday: scheduleRow?.next_run_at ?? null,
    estimatedTotal,
    sourceCurrency,
    headcount: people.length,
    activeCount: active.length,
    heldCount: held.length,
    needsDestinationCount: needsDestination.length,
    connectedCount: people.filter((p) => p.connectionStatus === "approved").length,
    pendingConnectionCount: people.filter((p) => p.connectionStatus === "pending").length,
    attentionCount: active.filter((p) => p.readinessStatus !== "ready").length,
    funded: shortfall <= 0,
    shortfall,
    availableBalance,
    railMix,
    draftRunId: draftRun?.id ?? null,
    pendingApprovalRunId: pendingRun?.id ?? null,
    recentRuns: (recentRunRows ?? []).map((r) => mapRowToPayrollRun(r as PayrollRunRow)),
    attentionItems,
  }

  return NextResponse.json({ overview })
}
