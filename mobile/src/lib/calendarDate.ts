/** Parse `YYYY-MM-DD` as a local calendar date (not UTC midnight). */
export function parseCalendarDate(isoDate: string): Date | null {
  const trimmed = isoDate.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null

  const date = new Date(year, month, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

/** Format a local `Date` as `YYYY-MM-DD`. */
export function formatCalendarDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Display a stored `YYYY-MM-DD` without UTC day-shift. */
export function formatCalendarDateDisplay(
  isoDate: string,
  locale = 'en-US',
): string {
  const date = parseCalendarDate(isoDate)
  if (!date) return isoDate
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
