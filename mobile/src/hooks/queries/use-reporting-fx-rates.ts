import { useQuery } from '@tanstack/react-query'
import type { ReportingFxRate } from '@easner/shared'
import { apiFetch } from '../../query/api-client'

function normalizeReportingRates(input: unknown): ReportingFxRate[] {
  if (!Array.isArray(input)) return []
  return input
    .map((value) => {
      const row = value as Record<string, unknown>
      return {
        from_currency: String(row.from_currency ?? '').toUpperCase(),
        to_currency: String(row.to_currency ?? '').toUpperCase(),
        rate: Number(row.rate ?? 0),
        status: row.status != null ? String(row.status) : undefined,
      }
    })
    .filter(
      (rate) =>
        rate.from_currency &&
        rate.to_currency &&
        Number.isFinite(rate.rate) &&
        rate.rate > 0,
    )
}

/** Reporting-only FX used to normalize EUR wallet activity to mobile USD. */
export function useReportingFxRates() {
  return useQuery({
    queryKey: ['fx', 'reporting-rates', 'mobile'],
    queryFn: async () => {
      const body = await apiFetch<{ rates?: ReportingFxRate[] }>(
        '/api/fx/exchange-rates',
      )
      return normalizeReportingRates(body.rates ?? [])
    },
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, freshness: 'reference' },
  })
}
