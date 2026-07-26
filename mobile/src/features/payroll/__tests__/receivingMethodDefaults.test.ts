import type { RecipientCatalogEntry } from '../../../lib/recipientCatalog'
import { resolvePayrollReceivingDestination } from '../receivingMethodDefaults'

function destination(countryCode: string, currencyCode: string): RecipientCatalogEntry {
  return {
    countryCode,
    countryName: countryCode,
    currencyCode,
    currencyName: currencyCode,
    recipientType: 'bank',
    status: 'supported',
    fields: [],
  }
}

describe('resolvePayrollReceivingDestination', () => {
  const catalog = [
    destination('KE', 'KES'),
    destination('NG', 'NGN'),
    destination('NG', 'USD'),
  ]

  it.each(['bank', 'mobile_money'] as const)(
    'selects the first residence-country destination for %s',
    (type) => {
      expect(resolvePayrollReceivingDestination({
        type,
        destinations: catalog,
        residenceCountry: ' ng ',
      })).toBe(catalog[1])
    },
  )

  it.each(['bank', 'mobile_money'] as const)(
    'falls back to the first supported destination for %s',
    (type) => {
      expect(resolvePayrollReceivingDestination({
        type,
        destinations: catalog,
        residenceCountry: 'US',
      })).toBe(catalog[0])
    },
  )

  it('selects the first wallet asset regardless of residence', () => {
    expect(resolvePayrollReceivingDestination({
      type: 'stablecoin',
      destinations: catalog,
      residenceCountry: 'NG',
    })).toBe(catalog[0])
  })

  it('preserves an existing user selection during catalog refresh', () => {
    expect(resolvePayrollReceivingDestination({
      type: 'bank',
      destinations: catalog,
      residenceCountry: 'NG',
      current: catalog[2],
    })).toBe(catalog[2])
  })

  it('returns null only when no supported destination exists', () => {
    expect(resolvePayrollReceivingDestination({
      type: 'mobile_money',
      destinations: [],
      residenceCountry: 'NG',
    })).toBeNull()
  })
})
