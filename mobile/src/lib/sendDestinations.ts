import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SendDestinationsResponse } from '@easner/shared'
import { apiRequest } from './apiClient'
import {
  setPayoutCorridorCache,
  getPayoutCorridorCache,
  setCryptoDestinationsCache,
  type PayoutCorridorCacheShape,
} from './recipientCatalog'

const STORAGE_KEY = 'easner_send_destinations_v2'
const STORAGE_ETAG = 'easner_send_destinations_etag'

const memory: { body?: SendDestinationsResponse; etag?: string } = {}

export function usePayoutCorridorsCatalogMobile(): boolean {
  return process.env.EXPO_PUBLIC_USE_PAYOUT_CORRIDORS !== 'false'
}

export function useSendDestinationsCatalogMobile(): boolean {
  return process.env.EXPO_PUBLIC_USE_SEND_DESTINATIONS !== 'false' && usePayoutCorridorsCatalogMobile()
}

function toCorridorCache(body: SendDestinationsResponse): PayoutCorridorCacheShape {
  return { bank: body.fiat.bank_transfer, mobile: body.fiat.mobile_money }
}

export function applySendDestinationsBody(body: SendDestinationsResponse | null): void {
  if (!body?.fiat) {
    memory.body = undefined
    setPayoutCorridorCache(null)
    setCryptoDestinationsCache(null)
    return
  }
  memory.body = body
  setPayoutCorridorCache(toCorridorCache(body))
  setCryptoDestinationsCache(body.crypto ?? [])
}

/** In-process catalog (hydrated from disk or last API refresh). */
export function getSendDestinationsMemory(): SendDestinationsResponse | null {
  return memory.body ?? null
}

export { getPayoutCorridorCache }

export async function hydrateSendDestinationsFromStorage(): Promise<SendDestinationsResponse | null> {
  if (!useSendDestinationsCatalogMobile()) return null
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return memory.body ?? null
    const parsed = JSON.parse(raw) as SendDestinationsResponse
    if (parsed?.fiat) {
      applySendDestinationsBody(parsed)
      const storedEtag = await AsyncStorage.getItem(STORAGE_ETAG)
      if (storedEtag) memory.etag = storedEtag
    }
    return memory.body ?? null
  } catch {
    return memory.body ?? null
  }
}

export async function refreshSendDestinations(): Promise<SendDestinationsResponse | null> {
  if (!useSendDestinationsCatalogMobile()) return null
  try {
    const headers: Record<string, string> = {}
    if (memory.etag) headers['If-None-Match'] = memory.etag

    const res = await apiRequest('/api/send-destinations?annotateProviders=true', { headers })
    if (res.status === 304) {
      return memory.body ?? (await hydrateSendDestinationsFromStorage())
    }
    if (!res.ok) return memory.body ?? null

    const newEtag = res.headers.get('ETag')
    if (newEtag) {
      memory.etag = newEtag
      await AsyncStorage.setItem(STORAGE_ETAG, newEtag)
    }

    const body = (await res.json()) as SendDestinationsResponse
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(body))
    applySendDestinationsBody(body)
    return body
  } catch (e) {
    console.warn('refreshSendDestinations', e)
    return memory.body ?? null
  }
}

export async function getCachedSendDestinations(): Promise<SendDestinationsResponse | null> {
  if (memory.body) return memory.body
  return hydrateSendDestinationsFromStorage()
}

/** @deprecated use refreshSendDestinations */
export const refreshPayoutCorridors = refreshSendDestinations
export const hydratePayoutCorridorsFromStorage = hydrateSendDestinationsFromStorage
