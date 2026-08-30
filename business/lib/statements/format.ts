import { formatMoneyDisplay } from "@easner/shared"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

export function isStatementCurrency(raw: string): raw is "USD" | "EUR" {
  const c = raw.trim().toUpperCase()
  return c === "USD" || c === "EUR"
}

export function parseIsoDateOnly(raw: string): string | null {
  const s = String(raw ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  if (d.toISOString().slice(0, 10) !== s) return null
  return s
}

export function isoDateFromInstant(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** Calendar date as `13 Jul 2026`. */
export function formatStatementCalendarDate(isoDate: string): string {
  const [y, m, day] = isoDate.split("-").map((p) => Number(p))
  if (!y || !m || !day) return isoDate
  const month = MONTHS[m - 1]
  if (!month) return isoDate
  return `${day} ${month} ${y}`
}

export function formatStatementPeriodLabel(fromIso: string, toIso: string): string {
  return `${formatStatementCalendarDate(fromIso)} – ${formatStatementCalendarDate(toIso)}`
}

export function resolveTimeZone(raw: string | null | undefined): string {
  const zone = String(raw ?? "").trim()
  if (!zone) return "UTC"
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date())
    return zone
  } catch {
    return "UTC"
  }
}

/** e.g. `29 Aug 2026, 18:40 WAT` */
export function formatAvailableAsOf(at: Date, timeZone: string): string {
  const zone = resolveTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(at)

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""
  const day = pick("day")
  const month = pick("month")
  const year = pick("year")
  const hour = pick("hour")
  const minute = pick("minute")
  const tz = pick("timeZoneName") || zone
  return `${day} ${month} ${year}, ${hour}:${minute} ${tz}`
}

export function formatStatementMoney(amount: number, currency: string): string {
  if (amount < 0) {
    return `-${formatMoneyDisplay(Math.abs(amount), currency)}`
  }
  return formatMoneyDisplay(amount, currency)
}

export function clipPeriodToAccountOpen(input: {
  fromIso: string
  toIso: string
  accountOpenedIso: string | null
  todayIso: string
}): { fromIso: string; toIso: string } {
  let from = input.fromIso
  let to = input.toIso
  if (input.accountOpenedIso && from < input.accountOpenedIso) from = input.accountOpenedIso
  if (to > input.todayIso) to = input.todayIso
  if (from > to) from = to
  return { fromIso: from, toIso: to }
}

export function periodBoundsUtc(fromIso: string, toIso: string): { start: Date; end: Date } {
  return {
    start: new Date(`${fromIso}T00:00:00.000Z`),
    end: new Date(`${toIso}T23:59:59.999Z`),
  }
}
