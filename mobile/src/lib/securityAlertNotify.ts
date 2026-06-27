import { apiPost } from './apiClient'

export type SecurityAlertType = 'password_changed' | 'mfa_enabled' | 'mfa_disabled'

/** Fire-and-forget security alert email via business API (same as business web settings). */
export async function notifySecurityAlert(alertType: SecurityAlertType): Promise<void> {
  await apiPost('/api/notifications/security-alert', { alertType }).catch(() => undefined)
}
