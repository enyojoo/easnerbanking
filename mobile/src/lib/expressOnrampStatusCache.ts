import { apiFetch } from '../query/api-client'
import type { ExpressDepositsNextStep } from '@easner/shared'

export type ExpressOnrampStatus = {
  ready?: boolean
  nextStep?: ExpressDepositsNextStep
  publishableKey?: string
  prefill?: Record<string, unknown>
  payerCountry?: string | null
  eligible?: boolean
}

let cached: ExpressOnrampStatus | null = null
let inflight: Promise<ExpressOnrampStatus> | null = null

export function peekExpressOnrampStatus(): ExpressOnrampStatus | null {
  return cached
}

export function cacheExpressOnrampStatus(data: ExpressOnrampStatus) {
  cached = data
}

function loadStatus(): Promise<ExpressOnrampStatus> {
  if (inflight) return inflight
  inflight = apiFetch<ExpressOnrampStatus>('/api/stripe/onramp/status')
    .then((data) => {
      cached = data
      return data
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function fetchExpressOnrampStatus(force = false): Promise<ExpressOnrampStatus> {
  if (!force && cached) {
    void loadStatus().catch(() => undefined)
    return Promise.resolve(cached)
  }
  return loadStatus()
}

export function warmExpressOnrampStatus() {
  void loadStatus().catch(() => undefined)
}
