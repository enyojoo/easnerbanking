/** Business base currencies – used for reporting FX (dashboard totals after base change). */
export const REPORTING_FX_CURRENCY_CODES = ["USD", "EUR", "GBP", "NGN"] as const

export type ReportingFxCurrencyCode = (typeof REPORTING_FX_CURRENCY_CODES)[number]

const REPORTING_FX_SET = new Set<string>(REPORTING_FX_CURRENCY_CODES)

export function isReportingFxCurrencyCode(code: string): boolean {
  return REPORTING_FX_SET.has(code.trim().toUpperCase())
}

export function isReportingFxPair(from: string, to: string): boolean {
  const f = from.trim().toUpperCase()
  const t = to.trim().toUpperCase()
  if (f === t) return false
  return isReportingFxCurrencyCode(f) && isReportingFxCurrencyCode(t)
}

/** All directed crosses among reporting base currencies (12 pairs for 4 codes). */
export function reportingFxDirectedPairs(): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = []
  for (const from of REPORTING_FX_CURRENCY_CODES) {
    for (const to of REPORTING_FX_CURRENCY_CODES) {
      if (from !== to) out.push({ from, to })
    }
  }
  return out
}
