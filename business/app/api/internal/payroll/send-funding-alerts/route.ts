import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recalculateRunTotals } from "@/lib/payroll/run-utils"
import { sendPayrollFundingReminderEmail } from "@/lib/payroll/send-funding-reminder-email"

const FUNDING_ALERT_DAYS = 3
const UPCOMING_STATUSES = ["draft", "pending_approval", "approved", "scheduled", "needs_reapproval"]

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(amount)
}

function formatPayday(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`))
}

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const today = new Date()
  const from = today.toISOString().slice(0, 10)
  const through = addUtcDays(today, FUNDING_ALERT_DAYS).toISOString().slice(0, 10)
  const { data: runs, error } = await admin
    .from("payroll_runs")
    .select("id,business_id,payday,source_currency,metadata")
    .not("schedule_id", "is", null)
    .in("status", UPCOMING_STATUSES)
    .gte("payday", from)
    .lte("payday", through)
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let checked = 0
  let alerted = 0
  let skippedFunded = 0
  let skippedDuplicate = 0
  let failed = 0

  for (const run of runs ?? []) {
    checked++
    try {
      const runId = String(run.id)
      const businessId = String(run.business_id)
      const { totalSource, shortfall } = await recalculateRunTotals(admin, runId, businessId)
      if (shortfall <= 0) {
        skippedFunded++
        continue
      }

      const { data: existingAlert } = await admin
        .from("payroll_run_events")
        .select("id")
        .eq("run_id", runId)
        .eq("event_type", "run.funding_alert_sent")
        .limit(1)
        .maybeSingle()
      if (existingAlert) {
        skippedDuplicate++
        continue
      }

      const currency = String(run.source_currency || "USD").toUpperCase()
      const metadata = (run.metadata as Record<string, unknown> | null) ?? {}
      const recipients = await sendPayrollFundingReminderEmail({
        admin,
        businessId,
        runId,
        runName: String(metadata.name || "Payroll run"),
        paydayDisplay: formatPayday(String(run.payday)),
        requiredDisplay: formatMoney(totalSource, currency),
        availableDisplay: formatMoney(Math.max(0, totalSource - shortfall), currency),
        shortfallDisplay: formatMoney(shortfall, currency),
      })
      if (recipients === 0) continue

      await admin.from("payroll_run_events").insert({
        business_id: businessId,
        run_id: runId,
        event_type: "run.funding_alert_sent",
        data: {
          recipients,
          totalSource,
          shortfall,
          sourceCurrency: currency,
          payday: run.payday,
        },
      })
      alerted++
    } catch {
      failed++
    }
  }

  return NextResponse.json({ checked, alerted, skippedFunded, skippedDuplicate, failed })
}
