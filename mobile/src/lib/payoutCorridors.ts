import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PayoutCorridorPublic } from '@easner/shared'
import { apiRequest } from './apiClient'
import { getPayoutCorridorCache, setPayoutCorridorCache } from './recipientCatalog'
import type { Recipient } from '../types'

const STORAGE_BODY = 'easner_payout_corridors_v1'
const STORAGE_ETAG_BANK = 'easner_payout_corridors_etag_bank'
const STORAGE_ETAG_MOBILE = 'easner_payout_corridors_etag_mobile'

type CachedShape = { bank: PayoutCorridorPublic[]; mobile: PayoutCorridorPublic[] }

export function usePayoutCorridorsCatalogMobile(): boolean {
  return process.env.EXPO_PUBLIC_USE_PAYOUT_CORRIDORS !== 'false'
}

export { getPayoutCorridorCache }

async function fetchRail(
  rail: 'bank_transfer' | 'mobile_money',
  etagKey: string,
): Promise<PayoutCorridorPublic[]> {
  const etag = (await AsyncStorage.getItem(etagKey)) || undefined
  const headers: Record<string, string> = {}
  if (etag) headers['If-None-Match'] = etag

  const res = await apiRequest(`/api/payout-corridors?rail=${encodeURIComponent(rail)}`, { headers })
  if (res.status === 304) {
    const raw = await AsyncStorage.getItem(STORAGE_BODY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CachedShape
    return rail === 'bank_transfer' ? parsed.bank : parsed.mobile
  }
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    console.warn('payout-corridors fetch failed', rail, res.status, err)
    return []
  }
  const newEtag = res.headers.get('ETag')
  if (newEtag) await AsyncStorage.setItem(etagKey, newEtag)

  const j = (await res.json()) as { corridors?: PayoutCorridorPublic[] }
  return j.corridors ?? []
}

/** Load last successful snapshot from disk into in-memory corridor cache (fast first paint). */
export async function hydratePayoutCorridorsFromStorage(): Promise<void> {
  if (!usePayoutCorridorsCatalogMobile()) return
  try {
    const raw = await AsyncStorage.getItem(STORAGE_BODY)
    if (!raw) return
    const parsed = JSON.parse(raw) as CachedShape
    if (parsed.bank?.length || parsed.mobile?.length) {
      setPayoutCorridorCache(parsed)
    }
  } catch {
    // ignore
  }
}

export async function refreshPayoutCorridors(): Promise<void> {
  if (!usePayoutCorridorsCatalogMobile()) return
  try {
    const [bank, mobile] = await Promise.all([
      fetchRail('bank_transfer', STORAGE_ETAG_BANK),
      fetchRail('mobile_money', STORAGE_ETAG_MOBILE),
    ])
    const next: CachedShape = { bank, mobile }
    setPayoutCorridorCache(next)
    await AsyncStorage.setItem(STORAGE_BODY, JSON.stringify(next))
  } catch (e) {
    console.warn('refreshPayoutCorridors', e)
  }
}

function isWalletRecipient(r: Pick<Recipient, 'bank_name' | 'currency'>): boolean {
  const b = (r.bank_name || '').toLowerCase()
  return b.includes('wallet') && !b.includes('mobile money')
}

/** False when catalog is on, cache is populated, and country+currency+rail are not in enabled corridors. */
export function isRecipientPayoutCorridorActive(
  r: Pick<Recipient, 'bank_name' | 'mobile_provider' | 'country_code' | 'currency'>,
  cache: CachedShape | null,
): boolean {
  if (!usePayoutCorridorsCatalogMobile()) return true
  if (!cache || (!cache.bank.length && !cache.mobile.length)) return true
  if (isWalletRecipient(r as Recipient)) return true
  const b = (r.bank_name || '').toLowerCase()
  if (b.includes('easenet')) return true

  const isMobile = b.includes('mobile money') || Boolean(r.mobile_provider)
  const rail = isMobile ? cache.mobile : cache.bank
  const cc = (r.country_code || '').toUpperCase()
  const cur = (r.currency || '').toUpperCase()
  if (!cc || !cur) return true

  const hit = rail.some((c) => c.country_code.toUpperCase() === cc && c.currency_code.toUpperCase() === cur)
  return hit
}
