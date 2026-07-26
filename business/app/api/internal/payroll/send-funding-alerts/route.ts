import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recalculateRunTotals } from "@/lib/payroll/run-utils"
import { sendPayrollFundingReminderEmail } from "@/lib/payroll/send-funding-reminder-email"
import { resolvePayrollSourceDefaults } from "@/lib/payroll/source-account"
import {
  addPayrollCalendarDays,
  formatPayrollZonedDateTime,
  payrollDateTimeToUtc,
  payrollLocalDate,
} from "@/lib/payroll/schedule-preview"

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

function formatPayday(value: string, scheduledAt: string | null, timezone: string): string {
  if (scheduledAt) {
    const formatted = formatPayrollZonedDateTime(scheduledAt, timezone)
    if (formatted) return formatted
  }
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
  const from = addUtcDays(today, -1).toISOString().slice(0, 10)
  const through = addUtcDays(today, FUNDING_ALERT_DAYS + 1).toISOString().slice(0, 10)
  const { data: runs, error } = await admin
    .from("payroll_runs")
    .select("id,business_id,payday,source_currency,metadata,approval_snapshot")
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
      const defaults = await resolvePayrollSourceDefaults(admin, businessId)
      const frozenTiming = (
        (run.approval_snapshot as Record<string, unknown> | null)?.executionSchedule as
          | { localTime?: string; timezone?: string; scheduledAt?: string }
          | undefined
      )
      const timezone = String(frozenTiming?.timezone || defaults.timezone)
      const localTime = String(frozenTiming?.localTime || defaults.paydayTime)
      const payday = String(run.payday || "").slice(0, 10)
      const reminderDate = addPayrollCalendarDays(payday, -FUNDING_ALERT_DAYS)
      const reminderAt = reminderDate
        ? payrollDateTimeToUtc(reminderDate, localTime, timezone)
        : null
      const localToday = payrollLocalDate(today, timezone)
      if (
        !reminderAt ||
        new Date(reminderAt).getTime() > today.getTime() ||
        !localToday ||
        localToday > payday
      ) {
        continue
      }
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
        paydayDisplay: formatPayday(
          payday,
          typeof frozenTiming?.scheduledAt === "string" ? frozenTiming.scheduledAt : null,
          timezone,
        ),
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
          payday,
          reminderAt,
          timezone,
          localTime,
        },
      })
      alerted++
    } catch {
      failed++
    }
  }

  return NextResponse.json({ checked, alerted, skippedFunded, skippedDuplicate, failed })
}
