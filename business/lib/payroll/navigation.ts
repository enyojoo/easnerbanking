export function safePayrollReturnTo(
  value: string | null,
  fallback: string,
  allowedRoot = fallback,
) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback
  const path = value.split("?")[0]
  if (path !== allowedRoot && !path.startsWith(`${allowedRoot}/`)) return fallback
  return value
}
