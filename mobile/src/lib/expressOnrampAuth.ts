import {
  EXPRESS_DEPOSITS_COPY,
  expressSetupUserMessage,
  isExpressSetupDismissed,
} from '@easner/shared'
import { apiFetch } from '../query/api-client'
import { configureExpressOnrampLinkSession, type ExpressOnrampSdk } from './express-onramp'
import { isStripeHostElement } from './expressStripeElement'
import { cacheExpressOnrampStatus, peekExpressOnrampStatus } from './expressOnrampStatusCache'

let readyFor: string | null = null

function sessionKey(cryptoCustomerId?: string | null): string {
  return String(cryptoCustomerId || 'session').trim() || 'session'
}

export function markExpressOnrampAuthenticated(cryptoCustomerId?: string | null): void {
  readyFor = sessionKey(cryptoCustomerId)
}

export function clearExpressOnrampAuthenticated(): void {
  readyFor = null
}

function isAlreadyAuthenticated(cryptoCustomerId?: string | null): boolean {
  return readyFor != null && readyFor === sessionKey(cryptoCustomerId)
}

/**
 * Stripe collectPaymentMethod / checkout need a live Link session in this browser.
 * KYC being done is not enough. authenticate() is silent when consent is still valid.
 */
export async function ensureExpressOnrampAuthenticated(input: {
  sdk: ExpressOnrampSdk
  cryptoCustomerId?: string | null
  onHostElement?: (el: unknown | null) => void
}): Promise<
  | { ok: true; cryptoCustomerId: string | null }
  | { ok: false; reason: 'canceled' | 'failed'; message: string }
> {
  if (isAlreadyAuthenticated(input.cryptoCustomerId)) {
    return { ok: true, cryptoCustomerId: input.cryptoCustomerId ?? null }
  }
  if (!input.sdk.authenticate) {
    markExpressOnrampAuthenticated(input.cryptoCustomerId)
    return { ok: true, cryptoCustomerId: input.cryptoCustomerId ?? null }
  }

  try {
    const auth = await apiFetch<{ authIntentId?: string | null; needsRegister?: boolean }>(
      '/api/stripe/onramp/link-auth',
      { method: 'POST', body: {} },
    )
    if (auth.needsRegister || !auth.authIntentId) {
      return { ok: false, reason: 'failed', message: EXPRESS_DEPOSITS_COPY.setupRequiredHint }
    }
    const intentId = auth.authIntentId

    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        fn()
      }
      void input.sdk
        .authenticate?.(intentId, (raw) => {
          finish(() => resolve(raw && typeof raw === 'object' ? raw : {}))
        })
        .then((el) => {
          if (isStripeHostElement(el)) input.onHostElement?.(el)
        })
        .catch((error) => finish(() => reject(error)))
    })

    const outcome = String(result.result || '')
    if (isExpressSetupDismissed(outcome) || /cancel/i.test(outcome)) {
      input.onHostElement?.(null)
      return { ok: false, reason: 'canceled', message: EXPRESS_DEPOSITS_COPY.setupDismissed }
    }

    const customerId = String(result.crypto_customer_id || input.cryptoCustomerId || '').trim()
    if (outcome && outcome !== 'success' && !customerId) {
      input.onHostElement?.(null)
      return { ok: false, reason: 'failed', message: expressSetupUserMessage(outcome) }
    }

    if (customerId) {
      await configureExpressOnrampLinkSession(input.sdk, customerId)
      await apiFetch('/api/stripe/onramp/link-complete', {
        method: 'POST',
        body: {
          cryptoCustomerId: customerId,
          accessToken: result.access_token || result.oauth_token,
          authIntentId: intentId,
        },
      }).catch(() => undefined)
      const cached = peekExpressOnrampStatus()
      if (cached) cacheExpressOnrampStatus({ ...cached, cryptoCustomerId: customerId })
    }

    input.onHostElement?.(null)
    markExpressOnrampAuthenticated(customerId || input.cryptoCustomerId)
    return { ok: true, cryptoCustomerId: customerId || input.cryptoCustomerId || null }
  } catch (error) {
    input.onHostElement?.(null)
    clearExpressOnrampAuthenticated()
    const message = error instanceof Error && error.message.trim()
      ? expressSetupUserMessage(error.message)
      : EXPRESS_DEPOSITS_COPY.somethingWentWrong
    if (isExpressSetupDismissed(message) || /cancel/i.test(message)) {
      return { ok: false, reason: 'canceled', message: EXPRESS_DEPOSITS_COPY.setupDismissed }
    }
    return { ok: false, reason: 'failed', message }
  }
}
