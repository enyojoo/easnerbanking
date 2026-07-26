import type { PayrollScheduleFrequency } from "@/lib/payroll/types"

export type PayrollWeekendPolicy = "previous_business_day" | "next_business_day"

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function wallClockParts(instant: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  }
}

function wallClockValue(
  parts: ReturnType<typeof wallClockParts>,
): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
}

function offsetAt(instant: number, timeZone: string): number {
  return wallClockValue(wallClockParts(instant, timeZone)) - instant
}

function matchingInstants(desiredWallClock: number, timeZone: string): number[] {
  const offsets = new Set<number>()
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = desiredWallClock + hours * 60 * 60 * 1000
    offsets.add(offsetAt(sample, timeZone))
  }
  return [...offsets]
    .map((offset) => desiredWallClock - offset)
    .filter((instant) => wallClockValue(wallClockParts(instant, timeZone)) === desiredWallClock)
    .sort((a, b) => a - b)
}

export function isPayrollPaydayTime(value: string): boolean {
  return /^([01]\d|2[0-3]):(?:00|30)$/.test(value)
}

export function payrollLocalDate(
  instant: Date | string | number,
  timeZone: string,
): string | null {
  const value = instant instanceof Date ? instant.getTime() : new Date(instant).getTime()
  if (!Number.isFinite(value)) return null
  try {
    const parts = wallClockParts(value, timeZone)
    return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
  } catch {
    return null
  }
}

export function addPayrollCalendarDays(value: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  date.setUTCDate(date.getUTCDate() + days)
  return dateOnly(date)
}

export function isPayrollDraftDue(input: {
  payday: string
  timezone: string
  now?: Date | string | number
  leadDays?: number
}): boolean {
  const localToday = payrollLocalDate(input.now ?? Date.now(), input.timezone)
  const draftOn = addPayrollCalendarDays(input.payday, -(input.leadDays ?? 5))
  return Boolean(localToday && draftOn && localToday >= draftOn)
}

export function payrollFundingReminderAt(input: {
  payday: string
  localTime: string
  timezone: string
  leadDays?: number
}): string | null {
  const reminderDate = addPayrollCalendarDays(
    input.payday,
    -(input.leadDays ?? 3),
  )
  return reminderDate
    ? payrollDateTimeToUtc(reminderDate, input.localTime, input.timezone)
    : null
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isPayrollPaydayTime(time)) {
    return null
  }
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const desiredWallClock = Date.UTC(year, month - 1, day, hour, minute)
  try {
    const exact = matchingInstants(desiredWallClock, timeZone)
    if (exact.length > 0) {
      // Repeated wall-clock times use the first occurrence.
      return new Date(exact[0]).toISOString()
    }

    // A skipped wall-clock time moves forward by the daylight-saving gap.
    const before = offsetAt(desiredWallClock - 12 * 60 * 60 * 1000, timeZone)
    const after = offsetAt(desiredWallClock + 12 * 60 * 60 * 1000, timeZone)
    const gap = after - before
    if (gap <= 0) return null
    const shifted = matchingInstants(desiredWallClock + gap, timeZone)
    return shifted.length > 0 ? new Date(shifted[0]).toISOString() : null
  } catch {
    return null
  }
}

export function formatPayrollZonedDateTime(
  value: string,
  timeZone: string,
  locale = "en",
): string | null {
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null
  try {
    const formatted = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(instant)
    return `${formatted} (${timeZone})`
  } catch {
    return null
  }
}

export function payrollTimingPreview(input: {
  payday: string
  localTime: string
  timezone: string
}): {
  payday: string
  localTime: string
  timezone: string
  scheduledAt: string
  display: string
} | null {
  const scheduledAt = payrollDateTimeToUtc(input.payday, input.localTime, input.timezone)
  if (!scheduledAt) return null
  return {
    ...input,
    scheduledAt,
    display:
      formatPayrollZonedDateTime(scheduledAt, input.timezone) ??
      `${input.payday} ${input.localTime} (${input.timezone})`,
  }
}
