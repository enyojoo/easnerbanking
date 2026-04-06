/**
 * Prevent open redirects after login: only allow in-app paths for terminal / pay.
 */
export function getSafeNextPath(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed.startsWith("/")) return null
  if (trimmed.startsWith("//")) return null
  const pathOnly = trimmed.split(/[?#]/)[0] ?? trimmed
  if (pathOnly === "/terminal") return trimmed.slice(0, 512)
  if (pathOnly === "/pay" || pathOnly.startsWith("/pay/")) return trimmed.slice(0, 512)
  return null
}
