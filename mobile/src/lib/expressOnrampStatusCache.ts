import { apiFetch } from '../query/api-client'
import type { ExpressDepositsNextStep } from '@easner/shared'
import { loadMobileExpressOnramp, prefetchMobileExpressOnramp } from './express-onramp'

export type ExpressOnrampStatus = {
  ready?: boolean
  nextStep?: ExpressDepositsNextStep
  publishableKey?: string
  prefill?: Record<string, unknown>
  payerCountry?: string | null
  eligible?: boolean
  cryptoCustomerId?: string | null
  methods?: string[]
  office?: { stripeOnrampEnabled?: boolean; stripeOnrampEuEnabled?: boolean }
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
      if (data.publishableKey) void loadMobileExpressOnramp(data.publishableKey).catch(() => undefined)
      else prefetchMobileExpressOnramp()
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
