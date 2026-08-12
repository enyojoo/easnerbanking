import { countryService, type Country } from './countryService'

/** Keep in sync with packages/shared/src/country-picker-order.ts */
const PICKER_PRIORITY = ['US', 'EE', 'NG', 'GB', 'CA'] as const

function priorityRank(code: string): number {
  const ix = (PICKER_PRIORITY as readonly string[]).indexOf(code.toUpperCase())
  return ix === -1 ? PICKER_PRIORITY.length : ix
}

function sortResidenceCountries(countries: Country[]): Country[] {
  return [...countries].sort((a, b) => {
    const ra = priorityRank(a.code)
    const rb = priorityRank(b.code)
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })
}

/** Pre-sorted local catalog — signup picker renders instantly with no async work. */
export const RESIDENCE_COUNTRY_CATALOG = sortResidenceCountries(
  countryService.getAllIncludingUnsupportedSync(),
)
