import { fetchWithSession } from "@/lib/fetch-with-session"

export type BusinessExpressOnrampStatus = {
  eligible?: boolean
  ready?: boolean
  payerCountry?: string | null
  methods?: string[]
  office?: { stripeOnrampEnabled?: boolean; stripeOnrampEuEnabled?: boolean }
}

const SCOPE = { "X-Easner-Account-Scope": "business" } as const

let cached: BusinessExpressOnrampStatus | null = null
let inflight: Promise<BusinessExpressOnrampStatus> | null = null

export function peekBusinessExpressOnrampStatus(): BusinessExpressOnrampStatus | null {
  return cached
}

function loadStatus(): Promise<BusinessExpressOnrampStatus> {
  if (inflight) return inflight
  inflight = fetchWithSession("/api/stripe/onramp/status", { headers: SCOPE })
    .then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as BusinessExpressOnrampStatus
      if (res.ok) cached = data
      return data
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function fetchBusinessExpressOnrampStatus(force = false): Promise<BusinessExpressOnrampStatus> {
  if (!force && cached) {
    void loadStatus().catch(() => undefined)
    return Promise.resolve(cached)
  }
  return loadStatus()
}

export function warmBusinessExpressOnrampStatus() {
  void loadStatus().catch(() => undefined)
}
