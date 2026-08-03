/** Canonical transaction timestamp: "Aug 03, 2026 • 4:54 AM". */
export function formatTransactionWhen(
  input: string | number | Date | null | undefined,
  options?: { timeZone?: string },
): string {
  if (input == null || input === "") return ""
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ""

  // React Native's Intl implementation differs between Hermes versions, and
  // formatToParts is not consistently available on older iOS runtimes. Build
  // the normal device-local display from Date getters so iOS and Android emit
  // exactly the same punctuation and zero-padding.
  if (!options?.timeZone) {
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ] as const
    const month = months[date.getMonth()]
    const day = String(date.getDate()).padStart(2, "0")
    const year = date.getFullYear()
    const rawHours = date.getHours()
    const hour = rawHours % 12 || 12
    const minute = String(date.getMinutes()).padStart(2, "0")
    const dayPeriod = rawHours >= 12 ? "PM" : "AM"
    return `${month} ${day}, ${year} • ${hour}:${minute} ${dayPeriod}`
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(options?.timeZone ? { timeZone: options.timeZone } : {}),
    }).formatToParts(date)
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? ""
    const month = value("month")
    const day = value("day")
    const year = value("year")
    const hour = value("hour")
    const minute = value("minute")
    const dayPeriod = value("dayPeriod").toUpperCase()
    if (!month || !day || !year || !hour || !minute || !dayPeriod) return ""
    return `${month} ${day}, ${year} • ${hour}:${minute} ${dayPeriod}`
  } catch {
    // A valid timestamp should still render if a runtime cannot format the
    // requested timezone. Device-local time is safer than an empty When row.
    return formatTransactionWhen(date)
  }
}
