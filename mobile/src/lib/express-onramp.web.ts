import type { ExpressOnrampSdk } from './express-onramp-types'

export type { ExpressOnrampSdk }

export async function loadMobileExpressOnramp(publishableKey: string): Promise<ExpressOnrampSdk> {
  const mod = (await import('@stripe/crypto')) as {
    loadCryptoOnrampAndInitialize?: (pk: string, opts?: Record<string, unknown>) => Promise<ExpressOnrampSdk>
  }
  if (!mod.loadCryptoOnrampAndInitialize) throw new Error('Express deposits is not available.')
  return mod.loadCryptoOnrampAndInitialize(publishableKey, { theme: 'stripe' })
}
