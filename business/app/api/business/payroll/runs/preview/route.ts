import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { mapRowToPayrollPerson, type PayrollPersonRow } from "@/lib/payroll/map-payroll"
import { readBusinessAvailableBalance } from "@/lib/payroll/helpers"
import type {
  PayrollDeliveryEstimate,
  PayrollReadinessIssue,
  PayrollRunDraftInput,
  PayrollRunPreview,
} from "@/lib/payroll/types"

const deliveryByRail: Record<string, PayrollDeliveryEstimate> = {
  easetag: { rail: "easetag", label: "Usually instant", estimatedArrival: "Instant after settlement" },
  bank: { rail: "bank", label: "Bank account", estimatedArrival: "Usually 1–3 business days" },
  mobile: { rail: "mobile_money", label: "Mobile money", estimatedArrival: "Usually within minutes" },
  crypto: { rail: "stablecoin", label: "Stablecoin wallet", estimatedArrival: "Usually within minutes" },
  intl_bank: { rail: "bank", label: "Bank account", estimatedArrival: "Usually 1–3 business days" },
}

export async function POST(request: Request) {
  const ctx = await requirePayrollAccess(request, ["preparer", "approver"])
  if (!ctx.ok) return ctx.response
  const input = (await request.json().catch(() => null)) as PayrollRunDraftInput | null
  if (!input || !Array.isArray(input.lines)) {
    return NextResponse.json({ error: "Invalid payroll run." }, { status: 400 })
  }
  const admin = createSupabaseAdmin()
  const ids = [...new Set(input.lines.map((line) => String(line.personId)))]
  const { data } = ids.length
    ? await admin.from("payroll_people").select("*").eq("business_id", ctx.businessId).in("id", ids)
    : { data: [] }
  const people = (data ?? []).map((row) => mapRowToPayrollPerson(row as PayrollPersonRow))
  const byId = new Map(people.map((person) => [person.id, person]))
  const issues: PayrollReadinessIssue[] = []
  for (const line of input.lines) {
    const person = byId.get(line.personId)
    if (!person) {
      issues.push({ code: "person_unavailable", severity: "blocking", personId: line.personId, message: "This person is no longer available." })
      continue
    }
    if (person.status !== "active" || person.readinessStatus !== "ready") {
      issues.push({
        code: "person_not_ready",
        severity: "blocking",
        personId: person.id,
        message: `${person.fullName} is not ready to be paid.`,
        actionLabel: "Review person",
        actionHref: `/payroll/people/${person.id}`,
      })
    }
    if (!Number.isFinite(Number(line.amount)) || Number(line.amount) <= 0) {
      issues.push({ code: "invalid_amount", severity: "blocking", personId: person.id, message: `Enter a valid amount for ${person.fullName}.` })
    }
    if (person.payCurrency !== input.sourceCurrency.toUpperCase()) {
      issues.push({ code: "currency_mismatch", severity: "blocking", personId: person.id, message: `${person.fullName} is set up for ${person.payCurrency}.` })
    }
  }
  const payrollTotal = input.lines.reduce((sum, line) => sum + (Number.isFinite(Number(line.amount)) ? Number(line.amount) : 0), 0)
  const fees = 0
  const sourceDebit = payrollTotal + fees
  const availableBalance = await readBusinessAvailableBalance(admin, ctx.businessId, input.sourceCurrency)
  if (sourceDebit > availableBalance) {
    issues.push({
      code: "insufficient_funds",
      severity: "blocking",
      message: `Add ${(sourceDebit - availableBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${input.sourceCurrency} before paying.`,
      actionLabel: "View accounts",
      actionHref: "/accounts",
    })
  }
  const usedRails = [...new Set(people.map((person) => person.rail))]
  const preview: PayrollRunPreview = {
    peopleCount: input.lines.length,
    payrollTotal,
    fees,
    sourceDebit,
    availableBalance,
    remainingBalance: availableBalance - sourceDebit,
    deliveryEstimates: usedRails.map((rail) => deliveryByRail[rail]).filter(Boolean),
    issues,
  }
  return NextResponse.json({ preview })
}
