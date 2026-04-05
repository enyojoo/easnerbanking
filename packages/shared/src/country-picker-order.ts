/**
 * ISO2 codes listed first in country/recipient pickers (aligned with signup & business settings).
 * Remaining rows sort by country name, then tie-breaker (e.g. currency).
 */
export const EASNER_COUNTRY_PICKER_PRIORITY = ["US", "EE", "NG", "GB", "CA"] as const

function priorityRankForCountryCode(code: string): number {
  const u = String(code || "")
    .trim()
    .toUpperCase()
  const ix = (EASNER_COUNTRY_PICKER_PRIORITY as readonly string[]).indexOf(u)
  return ix === -1 ? EASNER_COUNTRY_PICKER_PRIORITY.length : ix
}

/** Sort rows so priority countries appear first (same order as `countries` in business web), then A–Z. */
export function sortByEasnerCountryPickerOrder<T>(
  rows: T[],
  getCountryCode: (row: T) => string,
  getCountryName: (row: T) => string,
  getTieBreaker: (row: T) => string = () => "",
): T[] {
  return [...rows].sort((a, b) => {
    const ra = priorityRankForCountryCode(getCountryCode(a))
    const rb = priorityRankForCountryCode(getCountryCode(b))
    if (ra !== rb) return ra - rb
    const na = getCountryName(a)
    const nb = getCountryName(b)
    if (na !== nb) return na.localeCompare(nb)
    return getTieBreaker(a).localeCompare(getTieBreaker(b))
  })
}
