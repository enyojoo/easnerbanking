import { APP_URLS } from "./constants/urls"

/** HTTPS origin for personal/mobile universal links in email CTAs (`app.easner.com`). */
export function resolvePersonalMobileAppOrigin(envBase?: string | null): string {
  const trimmed = envBase?.trim()
  if (trimmed) return trimmed.replace(/\/$/, "")
  return APP_URLS.app
}

export function personalMobileDashboardUrl(origin?: string | null): string {
  return `${resolvePersonalMobileAppOrigin(origin)}/user/dashboard`
}

export function personalMobileNotificationsUrl(origin?: string | null): string {
  return `${resolvePersonalMobileAppOrigin(origin)}/user/notifications`
}

export function personalMobileTransactionUrl(
  transactionId: string,
  origin?: string | null,
): string {
  const base = resolvePersonalMobileAppOrigin(origin)
  return `${base}/user/transactions/${encodeURIComponent(transactionId)}`
}
