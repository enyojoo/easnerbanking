/**
 * Shared date formatting for admin tables.
 *
 * A cached `Intl.DateTimeFormat` matters here: `date.toLocaleString(...)`
 * constructs a new Intl formatter per call, and these run per row per render
 * in tables of hundreds of rows.
 */
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { month: "short" })

export function formatOfficeTimestamp(dateString: string): string {
  const date = new Date(dateString)
  const month = MONTH_SHORT.format(date)
  const day = date.getDate().toString().padStart(2, "0")
  const year = date.getFullYear()
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  const displayHours = hours % 12 || 12
  return `${month} ${day}, ${year} • ${displayHours}:${minutes} ${ampm}`
}

export function formatOfficeDate(dateString: string): string {
  const date = new Date(dateString)
  const month = MONTH_SHORT.format(date)
  const day = date.getDate().toString().padStart(2, "0")
  const year = date.getFullYear()
  return `${month} ${day}, ${year}`
}
