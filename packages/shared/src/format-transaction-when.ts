/** Canonical transaction timestamp: "Aug 03, 2026 • 4:54 AM". */
export function formatTransactionWhen(
  input: string | number | Date | null | undefined,
  options?: { timeZone?: string },
): string {
  if (input == null || input === "") return ""
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ""

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
    return ""
  }
}
