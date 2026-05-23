import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SendDestinationsResponse } from '@easner/shared'
import { apiRequest } from './apiClient'
import {
  setPayoutCorridorCache,
  getPayoutCorridorCache,
  setCryptoDestinationsCache,
  type PayoutCorridorCacheShape,
} from './recipientCatalog'

const STORAGE_KEY = 'easner_send_destinations_v1'
const STORAGE_ETAG = 'easner_send_destinations_etag'

export function usePayoutCorridorsCatalogMobile(): boolean {
  return process.env.EXPO_PUBLIC_USE_PAYOUT_CORRIDORS !== 'false'
}

export function useSendDestinationsCatalogMobile(): boolean {
  return process.env.EXPO_PUBLIC_USE_SEND_DESTINATIONS !== 'false' && usePayoutCorridorsCatalogMobile()
}

function toCorridorCache(body: SendDestinationsResponse): PayoutCorridorCacheShape {
  return { bank: body.fiat.bank_transfer, mobile: body.fiat.mobile_money }
}

export { getPayoutCorridorCache }

export async function hydrateSendDestinationsFromStorage(): Promise<void> {
  if (!useSendDestinationsCatalogMobile()) return
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as SendDestinationsResponse
    if (parsed?.fiat) {
      setPayoutCorridorCache(toCorridorCache(parsed))
      setCryptoDestinationsCache(parsed.crypto ?? [])
    }
  } catch {
    // ignore
  }
}

export async function refreshSendDestinations(): Promise<SendDestinationsResponse | null> {
  if (!useSendDestinationsCatalogMobile()) return null
  try {
    const etag = (await AsyncStorage.getItem(STORAGE_ETAG)) || undefined
    const headers: Record<string, string> = {}
    if (etag) headers['If-None-Match'] = etag

    const res = await apiRequest('/api/send-destinations?annotateProviders=true', { headers })
    if (res.status === 304) {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as SendDestinationsResponse
    }
    if (!res.ok) return null

    const newEtag = res.headers.get('ETag')
    if (newEtag) await AsyncStorage.setItem(STORAGE_ETAG, newEtag)

    const body = (await res.json()) as SendDestinationsResponse
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(body))
    setPayoutCorridorCache(toCorridorCache(body))
    setCryptoDestinationsCache(body.crypto ?? [])
    return body
  } catch (e) {
    console.warn('refreshSendDestinations', e)
    return null
  }
}

export async function getCachedSendDestinations(): Promise<SendDestinationsResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SendDestinationsResponse
  } catch {
    return null
  }
}

/** @deprecated use refreshSendDestinations */
export const refreshPayoutCorridors = refreshSendDestinations
export const hydratePayoutCorridorsFromStorage = hydrateSendDestinationsFromStorage
