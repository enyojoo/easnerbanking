import type { RecipientCatalogEntry } from '../../lib/recipientCatalog'
import type { PayrollExternalMethodType } from './types'

export function resolvePayrollReceivingDestination(input: {
  type: PayrollExternalMethodType
  destinations: RecipientCatalogEntry[]
  residenceCountry?: string | null
  current?: RecipientCatalogEntry | null
}): RecipientCatalogEntry | null {
  if (input.current && input.destinations.some((destination) => (
    destination.countryCode === input.current?.countryCode &&
    destination.currencyCode === input.current?.currencyCode
  ))) {
    return input.current
  }
  if (input.destinations.length === 0) return null
  if (input.type === 'stablecoin') return input.destinations[0]

  const residenceCountry = String(input.residenceCountry || '').trim().toUpperCase()
  return (
    input.destinations.find(
      (destination) => destination.countryCode.trim().toUpperCase() === residenceCountry,
    ) ?? input.destinations[0]
  )
}
