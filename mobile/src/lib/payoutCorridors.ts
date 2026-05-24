import type { Recipient } from '../types'
import { getPayoutCorridorCache } from './sendDestinations'
import type { PayoutCorridorCacheShape } from './recipientCatalog'

export {
  getPayoutCorridorCache,
  hydratePayoutCorridorsFromStorage,
  hydrateSendDestinationsFromStorage,
  refreshPayoutCorridors,
  refreshSendDestinations,
} from './sendDestinations'

type CachedShape = PayoutCorridorCacheShape

function isWalletRecipient(r: Pick<Recipient, 'bank_name' | 'currency'>): boolean {
  const b = (r.bank_name || '').toLowerCase()
  return b.includes('wallet') && !b.includes('mobile money')
}

/** False when cache is populated and country+currency+rail are not in office-enabled corridors. */
export function isRecipientPayoutCorridorActive(
  r: Pick<Recipient, 'bank_name' | 'mobile_provider' | 'country_code' | 'currency'>,
  cache: CachedShape | null,
): boolean {
  if (!cache || (!cache.bank.length && !cache.mobile.length)) return true
  if (isWalletRecipient(r as Recipient)) return true
  const b = (r.bank_name || '').toLowerCase()
  if (b.includes('easenet') || b.includes('easetag')) return true

  const isMobile = b.includes('mobile money') || Boolean(r.mobile_provider)
  const rail = isMobile ? cache.mobile : cache.bank
  const cc = (r.country_code || '').toUpperCase()
  const cur = (r.currency || '').toUpperCase()
  if (!cc || !cur) return true

  const hit = rail.find(
    (c) => c.country_code.toUpperCase() === cc && c.currency_code.toUpperCase() === cur,
  )
  if (!hit) return false
  if (typeof hit.noah_sell_available === 'boolean') return hit.noah_sell_available
  return true
}

/** True when recipient corridor is in catalog and Noah has sell channels (executable payout). */
export function isRecipientPayoutCorridorExecutable(
  r: Pick<Recipient, 'bank_name' | 'mobile_provider' | 'country_code' | 'currency'>,
  cache: CachedShape | null,
): boolean {
  return isRecipientPayoutCorridorActive(r, cache)
}
