import { getApiBaseUrl } from './apiClient'

export type MobilePlatformAccess = {
  maintenance: boolean
  registration: boolean
  maintenanceMessage: string
  registrationMessage: string
  minNativeVersion: string
}

export const PLATFORM_MAINTENANCE_CODE = 'PLATFORM_MAINTENANCE'

export async function fetchMobilePlatformAccess(): Promise<MobilePlatformAccess | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/platform/access?surface=consumer_mobile`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const data = (await res.json().catch(() => ({}))) as Partial<MobilePlatformAccess> & { error?: string }
    if (!res.ok) return null
    return {
      maintenance: Boolean(data.maintenance),
      registration: data.registration !== false,
      maintenanceMessage:
        data.maintenanceMessage || 'The Easner app is temporarily unavailable.',
      registrationMessage:
        data.registrationMessage || 'New Easner app accounts are not being accepted right now.',
      minNativeVersion: typeof data.minNativeVersion === 'string' ? data.minNativeVersion.trim() : '',
    }
  } catch {
    return null
  }
}
