import {
  corridorMatchesCountryCurrency,
  resolveBalancePayoutProvider,
  resolvePayoutCountryCode,
  resolveRecipientPayoutRail,
  type PayoutCorridorPublic,
  type PayoutProviderId,
} from '@easner/shared'
import type { Recipient } from '../types'
import type { PayoutCorridorCacheShape } from './recipientCatalog'

function findRecipientCorridor(
  recipient: Pick<Recipient, 'country_code' | 'currency' | 'bank_name' | 'mobile_provider'>,
  cache: PayoutCorridorCacheShape | null,
): PayoutCorridorPublic | null {
  if (!cache) return null
  const countryCode = resolvePayoutCountryCode({
    countryCode: recipient.country_code,
    currencyCode: recipient.currency,
  })
  const currencyCode = String(recipient.currency || '').trim().toUpperCase()
  if (!countryCode || !currencyCode) return null
  const rail = resolveRecipientPayoutRail({
    bankName: recipient.bank_name,
    mobileProvider: recipient.mobile_provider,
  })
  const corridors = rail === 'mobile_money' ? cache.mobile : cache.bank
  return (
    corridors.find((c) =>
      corridorMatchesCountryCurrency(c, { countryCode, currencyCode, rail }),
    ) ?? null
  )
}

/** Resolve Office primary balance payout provider for a saved recipient. */
export function resolveRecipientBalancePayoutProvider(
  recipient: Pick<Recipient, 'country_code' | 'currency' | 'bank_name' | 'mobile_provider'>,
  cache: PayoutCorridorCacheShape | null,
): PayoutProviderId | null {
  const corridor = findRecipientCorridor(recipient, cache)
  return resolveBalancePayoutProvider(corridor)
}
