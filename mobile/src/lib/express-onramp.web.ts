import type { ExpressOnrampSdk } from './express-onramp-types'
import { prepareExpressStripeWebDom } from './expressStripeWebMount'

export type { ExpressOnrampSdk }

let cached: ExpressOnrampSdk | null = null
let inflight: Promise<ExpressOnrampSdk> | null = null

export function prefetchMobileExpressOnramp(): void {
  prepareExpressStripeWebDom()
  void import('@stripe/crypto')
}

export async function loadMobileExpressOnramp(publishableKey: string): Promise<ExpressOnrampSdk> {
  prepareExpressStripeWebDom()
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    const mod = (await import('@stripe/crypto')) as {
      loadCryptoOnrampAndInitialize?: (pk: string, opts?: Record<string, unknown>) => Promise<ExpressOnrampSdk>
    }
    if (!mod.loadCryptoOnrampAndInitialize) throw new Error('Express deposits is not available.')
    cached = await mod.loadCryptoOnrampAndInitialize(publishableKey, { theme: 'stripe' })
    return cached
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}
