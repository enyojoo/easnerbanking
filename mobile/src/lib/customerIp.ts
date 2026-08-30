import { Platform } from 'react-native'
import * as Application from 'expo-application'
import { apiFetch } from '../query/api-client'

let cachedIp: string | null | undefined

/** Public IP as seen by the Easner API (cached for the app session). */
export async function resolveMobileCustomerIp(): Promise<string | undefined> {
  if (cachedIp !== undefined) return cachedIp || undefined
  try {
    const res = await apiFetch<{ ip?: string | null }>('/api/client-ip')
    cachedIp = res.ip?.trim() || null
  } catch {
    cachedIp = null
  }
  if (cachedIp) return cachedIp
  if (Platform.OS === 'web') return undefined
  try {
    const res = await fetch('https://api.ipify.org?format=json')
    if (res.ok) {
      const json = (await res.json()) as { ip?: string }
      cachedIp = json.ip?.trim() || null
    }
  } catch {
    cachedIp = null
  }
  return cachedIp || undefined
}

export function mobileCheckoutUserAgent(): string | undefined {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return navigator.userAgent
  }
  const appId = Application.applicationId ?? 'com.easner.mobile'
  const version = Application.nativeApplicationVersion ?? 'unknown'
  return `${appId}/${version} (${Platform.OS} ${String(Platform.Version)}) EasnerMobile`
}
