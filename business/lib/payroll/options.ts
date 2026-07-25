export const PAYROLL_PAYDAY_TIMES = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  const minute = index % 2 === 0 ? "00" : "30"
  const value = `${String(hour).padStart(2, "0")}:${minute}`
  const label = new Date(`2000-01-01T${value}:00`).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return { value, label }
})

const FALLBACK_TIMEZONES = [
  "UTC",
  "Africa/Accra",
  "Africa/Cairo",
  "Africa/Casablanca",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Chicago",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
]

export function payrollTimezoneOptions(current?: string): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[]
  }
  const supported = intl.supportedValuesOf?.("timeZone") ?? FALLBACK_TIMEZONES
  return [...new Set([current, "UTC", ...supported].filter(Boolean) as string[])].sort()
}
