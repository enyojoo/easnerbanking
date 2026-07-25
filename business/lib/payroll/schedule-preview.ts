import type { PayrollScheduleFrequency } from "@/lib/payroll/types"

export type PayrollWeekendPolicy = "previous_business_day" | "next_business_day"

function applyWeekendPolicy(date: Date, policy: PayrollWeekendPolicy) {
  const day = date.getUTCDay()
  if (day === 6) date.setUTCDate(date.getUTCDate() + (policy === "previous_business_day" ? -1 : 2))
  if (day === 0) date.setUTCDate(date.getUTCDate() + (policy === "previous_business_day" ? -2 : 1))
  return date
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
