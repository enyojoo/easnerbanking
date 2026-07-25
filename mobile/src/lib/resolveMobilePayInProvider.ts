import {
  corridorMatchesCountryCurrency,
  resolvePayInProvider,
  resolvePrimaryPayoutProvider,
  type PayInProviderId,
  type PayoutCorridorPublic,
} from '@easner/shared'
import { getPayoutCorridorCache } from './sendDestinations'

function findPayInCorridorRow(input: {
  countryCode: string
  currencyCode: string
  rail?: 'bank_transfer' | 'mobile_money'
}): PayoutCorridorPublic | null {
  const cc = input.countryCode.trim().toUpperCase()
  const cur = input.currencyCode.trim().toUpperCase()
  if (!cc || !cur) return null

  const cache = getPayoutCorridorCache()
  if (!cache) return null

  const pick = (rail: 'bank_transfer' | 'mobile_money') => {
    const list = rail === 'mobile_money' ? cache.mobile : cache.bank
    return (
      list.find((row) => corridorMatchesCountryCurrency(row, { countryCode: cc, currencyCode: cur })) ??
      null
    )
  }

  if (input.rail) return pick(input.rail)
  return pick('bank_transfer') ?? pick('mobile_money')
}

/** Match business local-deposit wizard: Office corridor metadata picks YC vs Grid pay-in API. */
export function resolveMobilePayInProvider(input: {
  countryCode: string
  currencyCode: string
  rail?: 'bank_transfer' | 'mobile_money'
}): PayInProviderId {
  const row = findPayInCorridorRow(input)
  if (!row) return 'yellowcard'

  if (row.metadata) {
    return resolvePayInProvider({
      providerRouting: row.provider_routing,
      metadata: row.metadata,
    })
  }

  const primary = resolvePrimaryPayoutProvider(row.provider_routing)
  if (primary === 'grid' || primary === 'yellowcard') return primary
  return 'yellowcard'
}

export { findPayInCorridorRow }
