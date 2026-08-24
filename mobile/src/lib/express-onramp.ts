import { EXPRESS_DEPOSITS_COPY } from '@easner/shared'
import { EXPRESS_NATIVE_AUTH_REQUIRED, type ExpressOnrampSdk } from './express-onramp-types'

export { EXPRESS_NATIVE_AUTH_REQUIRED }
export type { ExpressOnrampSdk }

type NativeOnramp = {
  configure: (config: {
    merchantDisplayName: string
    appearance: {
      style?: 'AUTOMATIC' | 'ALWAYS_LIGHT' | 'ALWAYS_DARK'
      lightColors?: { primary: string; contentOnPrimary: string; borderSelected: string }
    }
    cryptoCustomerId?: string
    googlePay?: { merchantCountryCode: string; merchantName: string; testEnv?: boolean }
  }) => Promise<{ error?: { message?: string } }>
  registerLinkUser: (info: {
    email: string
    phone: string
    country: string
    fullName?: string
  }) => Promise<{ customerId?: string; error?: { message?: string } }>
  authorize: (linkAuthIntentId: string) => Promise<{
    status?: string
    customerId?: string
    error?: { message?: string; stripeErrorCode?: string }
  }>
  isAuthError?: (error?: { message?: string; stripeErrorCode?: string }) => boolean
  attachKycInfo: (kycInfo: Record<string, unknown>) => Promise<{ error?: { message?: string } }>
  verifyIdentity: () => Promise<{ error?: { message?: string; code?: string; stripeErrorCode?: string } }>
  collectPaymentMethod: (
    paymentMethod: 'Card' | 'BankAccount' | 'CardAndBankAccount' | 'PlatformPay',
    platformPayParams?: Record<string, unknown>,
  ) => Promise<{ error?: { message?: string } }>
  createCryptoPaymentToken: () => Promise<{
    cryptoPaymentToken?: string
    error?: { message?: string }
  }>
  performCheckout: (
    onrampSessionId: string,
    provideCheckoutClientSecret: () => Promise<string | null>,
  ) => Promise<{ error?: { message?: string } }>
}

type Waiter = {
  resolve: (sdk: ExpressOnrampSdk) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let adapter: ExpressOnrampSdk | null = null
const waiters: Waiter[] = []

export function prefetchMobileExpressOnramp(): void {}

/** Web-only: native sheets are presented by Stripe, so there is nothing to observe. */
export function subscribeExpressOnrampUi(_listener: (open: boolean) => void): () => void {
  return () => {}
}

export function hideExpressOnrampFrame(): void {}

function flushWaiters(sdk: ExpressOnrampSdk) {
  while (waiters.length) {
    const waiter = waiters.shift()
    if (!waiter) break
    clearTimeout(waiter.timer)
    waiter.resolve(sdk)
  }
}

function failWaiters(error: Error) {
  while (waiters.length) {
    const waiter = waiters.shift()
    if (!waiter) break
    clearTimeout(waiter.timer)
    waiter.reject(error)
  }
}

export function setNativeExpressOnrampSdk(sdk: ExpressOnrampSdk | null): void {
  adapter = sdk
  if (sdk) flushWaiters(sdk)
}

export function failNativeExpressOnramp(error: Error): void {
  adapter = null
  failWaiters(error)
}

async function presentIdentity(
  onramp: NativeOnramp,
  cb?: (r: unknown) => void,
) {
  const result = await onramp.verifyIdentity()
  if (result.error && isAttestationError(result.error)) {
    throw new Error(EXPRESS_DEPOSITS_COPY.nativeTrustedInstall)
  }
  if (result.error && onramp.isAuthError?.(result.error)) {
    throw new Error(EXPRESS_NATIVE_AUTH_REQUIRED)
  }
  const canceled = /cancel/i.test(String(result.error?.code || result.error?.message || ''))
  const payload = result.error
    ? { result: canceled ? 'canceled' : 'error' }
    : { result: 'success' }
  cb?.(payload)
  return payload
}

/** Apple Pay and Google Pay both refuse to present without an amount and currency. */
function platformPayParams(
  opts: Record<string, unknown>,
  wallets: { applePay?: string; googlePay?: string },
): Record<string, unknown> {
  const currencyCode = String(opts.currency || 'USD').toUpperCase()
  const amount = Number(opts.amount) || 0
  const merchantCountryCode = String(opts.merchantCountryCode || 'US').toUpperCase()
  if (wallets.googlePay === 'auto') {
    return {
      googlePay: { currencyCode, amount: Math.round(amount * 100), label: 'Easner' },
    }
  }
  return {
    applePay: {
      merchantCountryCode,
      currencyCode,
      cartItems: [{ paymentType: 'Immediate', label: 'Easner', amount: amount.toFixed(2) }],
    },
  }
}

function isAttestationError(error?: { message?: string; stripeErrorCode?: string; code?: string }) {
  return /attestation|native link|devicecheck|app attest|play integrity/i.test(
    `${error?.message || ''} ${error?.stripeErrorCode || ''} ${error?.code || ''}`,
  )
}

export function adaptNativeOnramp(onramp: NativeOnramp): ExpressOnrampSdk {
  const throwIf = (error?: { message?: string; stripeErrorCode?: string; code?: string }) => {
    if (!error?.message) return
    if (isAttestationError(error)) {
      throw new Error(EXPRESS_DEPOSITS_COPY.nativeTrustedInstall)
    }
    throw new Error(error.message)
  }

  return {
    registerLinkUser: async (email, phone, country, fullName) => {
      const result = await onramp.registerLinkUser({ email, phone, country, fullName })
      throwIf(result.error)
      return result
    },
    authenticate: async (id, cb) => {
      const result = await onramp.authorize(id)
      const status = String(result.status || '')
      if ((status === 'Consented' || result.customerId) && !result.error) {
        await cb({
          result: 'success',
          crypto_customer_id: result.customerId,
        })
        return
      }
      if (status === 'Denied' || /denied|cancel|dismiss/i.test(status)) {
        await cb({ result: 'canceled' })
        return
      }
      throwIf(result.error)
      await cb({ result: status || 'error' })
    },
    submitKycInfo: async (info) => {
      const dob = info.date_of_birth as { day?: number; month?: number; year?: number } | undefined
      const result = await onramp.attachKycInfo({
        firstName: info.given_name,
        lastName: info.surname,
        dateOfBirth: dob,
        address: info.address,
      })
      throwIf(result.error)
    },
    verifyDocuments: async (cb) => presentIdentity(onramp, cb),
    verifyIdentity: async (cb) => presentIdentity(onramp, cb),
    collectPaymentMethod: async (opts, cb) => {
      const types = (opts.payment_method_types as string[] | undefined) || []
      const wallets = (opts.wallets as { applePay?: string; googlePay?: string } | undefined) || {}
      const usePlatform = wallets.applePay === 'auto' || wallets.googlePay === 'auto'
      const collected = usePlatform
        ? await onramp.collectPaymentMethod('PlatformPay', platformPayParams(opts, wallets))
        : await onramp.collectPaymentMethod(types.includes('us_bank_account') ? 'BankAccount' : 'Card')
      throwIf(collected.error)
      const token = await onramp.createCryptoPaymentToken()
      throwIf(token.error)
      if (!token.cryptoPaymentToken) throw new Error('Could not save payment method')
      await cb({ cryptoPaymentToken: token.cryptoPaymentToken, paymentMethodDetails: {} })
    },
    performCheckout: async (sessionId, provideSecret) => {
      const result = await onramp.performCheckout(sessionId, async () => {
        try {
          return await provideSecret(sessionId)
        } catch {
          return null
        }
      })
      throwIf(result.error)
      return { success: true }
    },
  }
}

export async function configureExpressOnrampLinkSession(
  _client: ExpressOnrampSdk,
  _cryptoCustomerId?: string | null,
): Promise<void> {}

export async function loadMobileExpressOnramp(
  _publishableKey?: string,
  _cryptoCustomerId?: string | null,
): Promise<ExpressOnrampSdk> {
  if (adapter) return adapter
  return new Promise((resolve, reject) => {
    const waiter: Waiter = {
      resolve,
      reject,
      timer: setTimeout(() => {
        const index = waiters.indexOf(waiter)
        if (index >= 0) waiters.splice(index, 1)
        reject(new Error('Express deposits is not ready. Try again in a moment.'))
      }, 20000),
    }
    waiters.push(waiter)
  })
}
