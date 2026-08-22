import { EXPRESS_NATIVE_AUTH_REQUIRED, type ExpressOnrampSdk } from './express-onramp-types'

export { EXPRESS_NATIVE_AUTH_REQUIRED }
export type { ExpressOnrampSdk }

const LEGACY_FRAME_ID = 'easner-express-onramp-frame'

let cached: ExpressOnrampSdk | null = null
let inflight: Promise<ExpressOnrampSdk> | null = null

function removeLegacyProxyFrame(): void {
  if (typeof document === 'undefined') return
  document.getElementById(LEGACY_FRAME_ID)?.remove()
}

/** Web-only: Stripe presents UI in the live document, so there is nothing to observe here. */
export function subscribeExpressOnrampUi(_listener: (open: boolean) => void): () => void {
  return () => {}
}

export function prefetchMobileExpressOnramp(): void {
  removeLegacyProxyFrame()
  void import('@stripe/crypto')
}

export async function loadMobileExpressOnramp(publishableKey: string): Promise<ExpressOnrampSdk> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    removeLegacyProxyFrame()
    const mod = (await import('@stripe/crypto')) as {
      loadCryptoOnrampAndInitialize?: (pk: string, opts?: Record<string, unknown>) => Promise<ExpressOnrampSdk>
      loadStripeOnramp?: (pk: string, opts?: Record<string, unknown>) => Promise<ExpressOnrampSdk>
    }
    const loader = mod.loadCryptoOnrampAndInitialize || mod.loadStripeOnramp
    if (!loader) throw new Error('Express deposits is not available.')
    cached = await loader(publishableKey, { theme: 'stripe' })
    return cached
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}
