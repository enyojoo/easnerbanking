import { Platform } from 'react-native'

export type ExpressOnrampSdk = {
  registerLinkUser?: (info: Record<string, unknown>) => Promise<unknown>
  authenticate?: (id: string, cb: (r: Record<string, unknown>) => void) => Promise<unknown>
  submitKycInfo?: (info: Record<string, unknown>) => Promise<unknown>
  getMissingIdentifiers?: () => Promise<{ identifiers?: Array<{ type?: string }> }>
  updateKycInfo?: (info: Record<string, unknown>) => Promise<{ completed?: boolean }>
  promptUserAttestation?: (cb: (r: Record<string, unknown>) => void) => Promise<unknown>
  verifyDocuments?: (cb?: (r: unknown) => void) => Promise<unknown>
  collectPaymentMethod?: (
    opts: Record<string, unknown>,
    cb: (r: { cryptoPaymentToken?: string; paymentMethodDetails?: Record<string, unknown> }) => void,
  ) => Promise<unknown>
  performCheckout?: (
    sessionId: string,
    cb: (id: string) => Promise<string>,
  ) => Promise<{ success?: boolean }>
}

export async function loadMobileExpressOnramp(publishableKey: string): Promise<ExpressOnrampSdk> {
  if (Platform.OS === 'web') {
    const mod = (await import('@stripe/crypto')) as {
      loadCryptoOnrampAndInitialize?: (pk: string, opts?: Record<string, unknown>) => Promise<ExpressOnrampSdk>
    }
    if (!mod.loadCryptoOnrampAndInitialize) throw new Error('Express deposits is not available.')
    return mod.loadCryptoOnrampAndInitialize(publishableKey, { theme: 'stripe' })
  }
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
