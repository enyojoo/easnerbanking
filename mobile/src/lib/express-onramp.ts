import type { ExpressOnrampSdk } from './express-onramp-types'

export type { ExpressOnrampSdk }

export function prefetchMobileExpressOnramp(): void {}

export async function loadMobileExpressOnramp(_publishableKey: string): Promise<ExpressOnrampSdk> {
  try {
    const stripe = require('@stripe/stripe-react-native') as {
      useOnramp?: () => ExpressOnrampSdk
    }
    if (stripe.useOnramp) return stripe.useOnramp()
  } catch {
    // optional native extra
  }
  return {}
}
