import type { PayrollScheduleFrequency } from "@/lib/payroll/types"

export type PayrollWeekendPolicy = "previous_business_day" | "next_business_day"

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function applyWeekendPolicy(date: Date, policy: PayrollWeekendPolicy) {
  const day = date.getUTCDay()
  if (day === 6) date.setUTCDate(date.getUTCDate() + (policy === "previous_business_day" ? -1 : 2))
  if (day === 0) date.setUTCDate(date.getUTCDate() + (policy === "previous_business_day" ? -2 : 1))
  return date
}

export function payrollPayPeriodForPayday(
  frequency: PayrollScheduleFrequency,
  payday: string,
): { start: string; end: string } | null {
  const end = new Date(`${payday}T12:00:00.000Z`)
  if (Number.isNaN(end.getTime())) return null
  const start = new Date(end)
  if (frequency === "weekly") start.setUTCDate(end.getUTCDate() - 6)
  else if (frequency === "biweekly") start.setUTCDate(end.getUTCDate() - 13)
  else if (frequency === "semimonthly") start.setUTCDate(end.getUTCDate() <= 15 ? 1 : 16)
  else start.setUTCDate(1)
  return { start: dateOnly(start), end: dateOnly(end) }
}

export function payrollPaydayPreview(input: {
  frequency: PayrollScheduleFrequency
  firstPayday: string
  weekendPolicy: PayrollWeekendPolicy
  count?: number
}): string[] {
  const count = Math.max(1, Math.min(12, input.count ?? 3))
  const first = new Date(`${input.firstPayday}T12:00:00.000Z`)
  if (Number.isNaN(first.getTime())) return []
  const output: string[] = []
  let cursor = new Date(first)
  for (let i = 0; i < count; i += 1) {
    output.push(applyWeekendPolicy(new Date(cursor), input.weekendPolicy).toISOString().slice(0, 10))
    if (input.frequency === "weekly") cursor.setUTCDate(cursor.getUTCDate() + 7)
    else if (input.frequency === "biweekly") cursor.setUTCDate(cursor.getUTCDate() + 14)
    else if (input.frequency === "monthly") cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    else if (cursor.getUTCDate() < 15) cursor.setUTCDate(15)
    else {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      cursor.setUTCDate(1)
    }
  }
  return output
}

export function payrollScheduleOccurrence(input: {
  frequency: PayrollScheduleFrequency
  nextRunAt: string
  weekendPolicy?: unknown
}): { payPeriodStart: string; payPeriodEnd: string; payday: string } | null {
  const nominalPayday = input.nextRunAt.slice(0, 10)
  const payday = payrollPaydayPreview({
    frequency: input.frequency,
    firstPayday: nominalPayday,
    weekendPolicy:
      input.weekendPolicy === "next_business_day"
        ? "next_business_day"
        : "previous_business_day",
    count: 1,
  })[0]
  const period = payrollPayPeriodForPayday(input.frequency, nominalPayday)
  if (!payday || !period) return null
  return {
    payPeriodStart: period.start,
    payPeriodEnd: period.end,
    payday,
  }
}

export function payrollDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return null
  }
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const desiredWallClock = Date.UTC(year, month - 1, day, hour, minute)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    )
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant
  }
  try {
    let instant = desiredWallClock - offsetAt(desiredWallClock)
    instant = desiredWallClock - offsetAt(instant)
    return new Date(instant).toISOString()
  } catch {
    return null
  }
}
