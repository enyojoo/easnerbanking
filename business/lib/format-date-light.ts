/**
 * Intl-based replacements for the app's two `date-fns` call sites — the
 * `format()` import pulled ~26 KB gzip of locale tables into the dashboard
 * bundle for two strings. Formatters are cached: constructing
 * `Intl.DateTimeFormat` per call is the expensive part.
 */
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
const LONG_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" })

/** Equivalent of date-fns `format(date, "MMM d")` → "Aug 25". */
export function formatMonthDay(date: Date): string {
  return MONTH_DAY.format(date)
}

/** Equivalent of date-fns `format(date, "PPP")` → "August 25th, 2026" (without the ordinal). */
export function formatLongDate(date: Date): string {
  return LONG_DATE.format(date)
}
