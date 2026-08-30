import {
  EXPRESS_DEPOSITS_COPY,
  classifyExpressDepositPayError,
  expressCashKindToPaymentMethod,
  expressDepositCheckoutMandateData,
  expressDepositCollectPaymentOpts,
  expressDepositPayNeedsCollect,
  expressDepositsQuoteIsStale,
  coalesceExpressSavedPaymentMethods,
  expressInstrumentFromCollectDetails,
  expressSavedInstrumentForMethod,
  expressSavedPaymentRail,
  isExpressSetupDismissed,
  mergeExpressSavedPaymentMethods,
  parseExpressDepositsAmountEntryMode,
  parseExpressDepositsPricing,
  parseExpressSavedPaymentMethods,
  validateExpressDepositsAmount,
  type ExpressCashKind,
  type ExpressDepositsPricingBreakdown,
  type ExpressSavedPaymentMethods,
} from '@easner/shared'
import { apiFetch, ApiError } from '../query/api-client'
import { cacheExpressOnrampStatus, peekExpressOnrampStatus } from './expressOnrampStatusCache'
import { loadMobileExpressOnramp } from './express-onramp'
import { ensureExpressOnrampAuthenticated } from './expressOnrampAuth'
import { isStripeHostElement } from './expressStripeElement'

export type ExpressDepositCheckoutResult =
  | { ok: true; easnerTransactionId: string | null; pricing: ExpressDepositsPricingBreakdown }
  | { ok: false; reason: 'kyc' | 'wrong_token' | 'canceled' | 'failed'; message: string }

function errorCode(error: unknown): string | null {
  if (error instanceof ApiError) return error.code
  return null
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

const quoteMemo = new Map<string, ExpressDepositsPricingBreakdown>()
const quoteInflight = new Map<string, Promise<ExpressDepositsPricingBreakdown>>()

function expressDepositQuoteKey(
  method: ExpressCashKind,
  enteredAmount: number,
  amountEntryMode: 'usd' | 'pay' = 'usd',
): string {
  return `${method}:${amountEntryMode}:${Math.round(enteredAmount * 100)}`
}

export function peekExpressDepositQuote(
  method: ExpressCashKind,
  enteredAmount: number,
  amountEntryMode: 'usd' | 'pay' = 'usd',
): ExpressDepositsPricingBreakdown | null {
  const hit = quoteMemo.get(expressDepositQuoteKey(method, enteredAmount, amountEntryMode))
  if (!hit || expressDepositsQuoteIsStale(hit.rateFetchedAt)) return null
  return hit
}

export async function fetchExpressDepositQuote(input: {
  method: ExpressCashKind
  usdCredit?: number
  youPay?: number
  amountEntryMode?: 'usd' | 'pay'
}): Promise<ExpressDepositsPricingBreakdown> {
  const amountEntryMode = parseExpressDepositsAmountEntryMode(input.amountEntryMode)
  const enteredAmount = amountEntryMode === 'pay' ? Number(input.youPay) : Number(input.usdCredit)
  const cached = peekExpressDepositQuote(input.method, enteredAmount, amountEntryMode)
  if (cached) return cached
  const key = expressDepositQuoteKey(input.method, enteredAmount, amountEntryMode)
  const pending = quoteInflight.get(key)
  if (pending) return pending
  const request = (async () => {
    const data = await apiFetch<{ pricing?: unknown }>('/api/stripe/onramp/quote', {
      method: 'POST',
      body: {
        usdCredit: input.usdCredit,
        youPay: input.youPay,
        amountEntryMode,
        paymentMethod: expressCashKindToPaymentMethod(input.method),
      },
    }).catch((error) => {
      const payload =
        error instanceof ApiError && error.payload && typeof error.payload === 'object'
          ? (error.payload as { pricing?: unknown })
          : null
      const pricing = parseExpressDepositsPricing(payload?.pricing)
      if (pricing && error instanceof ApiError && error.code === 'max_amount_exceeded') {
        return { pricing }
      }
      throw error
    })
    const pricing = parseExpressDepositsPricing(data.pricing)
    if (!pricing) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
    quoteMemo.set(key, pricing)
    return pricing
  })().finally(() => {
    quoteInflight.delete(key)
  })
  quoteInflight.set(key, request)
  return request
}

async function ensureFreshPricing(input: {
  usdCredit: number
  method: ExpressCashKind
  pricing: ExpressDepositsPricingBreakdown
}): Promise<ExpressDepositsPricingBreakdown> {
  const amountEntryMode = parseExpressDepositsAmountEntryMode(input.pricing.amountEntryMode)
  const pricing = expressDepositsQuoteIsStale(input.pricing.rateFetchedAt)
    ? await fetchExpressDepositQuote({
        method: input.method,
        usdCredit: input.pricing.usdCredit,
        youPay: input.pricing.quotedAmount ?? input.pricing.totalToPay,
        amountEntryMode,
      })
    : input.pricing
  const limit = validateExpressDepositsAmount({
    usdCredit: pricing.usdCredit,
    youPay: pricing.totalToPay,
    sourceCurrency: pricing.sourceCurrency,
    amountEntryMode,
  })
  if (!limit.ok) throw new Error(limit.message)
  return pricing
}

export async function collectExpressPaymentToken(input: {
  publishableKey: string
  cryptoCustomerId?: string | null
  method: ExpressCashKind
  amount?: number | null
  currency?: string | null
  paymentMethods?: ExpressSavedPaymentMethods | null
  onHostElement?: (el: unknown | null) => void
}): Promise<
  | { ok: true; paymentTokenId: string; paymentMethods: ExpressSavedPaymentMethods }
  | { ok: false; reason: 'canceled' | 'failed'; message: string }
> {
  try {
    const sdk = await loadMobileExpressOnramp(input.publishableKey, input.cryptoCustomerId)
    const authed = await ensureExpressOnrampAuthenticated({
      sdk,
      cryptoCustomerId: input.cryptoCustomerId,
      onHostElement: input.onHostElement,
    })
    if (!authed.ok) return authed
    if (!sdk.collectPaymentMethod) {
      return { ok: false, reason: 'failed', message: EXPRESS_DEPOSITS_COPY.somethingWentWrong }
    }
    const collected = await new Promise<{
      paymentTokenId: string
      paymentMethods: ExpressSavedPaymentMethods
    }>((resolve, reject) => {
      void sdk
        .collectPaymentMethod?.(
          expressDepositCollectPaymentOpts({
            method: input.method,
            amount: input.amount,
            currency: input.currency,
          }),
          async (result) => {
            if (!result.cryptoPaymentToken) {
              input.onHostElement?.(null)
              reject(new Error(EXPRESS_DEPOSITS_COPY.savePaymentHint))
              return
            }
            try {
              const rail = expressSavedPaymentRail(input.method)
              const display = expressInstrumentFromCollectDetails(result.paymentMethodDetails)
              const saved = await apiFetch<{ paymentMethods?: unknown }>('/api/stripe/onramp/payment-tokens', {
                method: 'POST',
                body: {
                  paymentTokenId: result.cryptoPaymentToken,
                  ...(rail
                    ? {
                        rail,
                        last4: display.last4,
                        brand: display.brand,
                        bankName: display.bankName,
                      }
                    : {}),
                },
              })
              const paymentMethods = rail
                ? coalesceExpressSavedPaymentMethods(
                    parseExpressSavedPaymentMethods(saved.paymentMethods),
                    mergeExpressSavedPaymentMethods(input.paymentMethods, rail, {
                      paymentTokenId: result.cryptoPaymentToken,
                      ...display,
                    }),
                  )
                : parseExpressSavedPaymentMethods(input.paymentMethods)
              const cached = peekExpressOnrampStatus()
              if (cached) cacheExpressOnrampStatus({ ...cached, paymentMethods })
              input.onHostElement?.(null)
              resolve({ paymentTokenId: result.cryptoPaymentToken, paymentMethods })
            } catch (error) {
              input.onHostElement?.(null)
              reject(error)
            }
          },
        )
        .then((el) => {
          if (isStripeHostElement(el)) input.onHostElement?.(el)
        })
        .catch(reject)
    })
    return { ok: true, ...collected }
  } catch (error) {
    const message = errorMessage(error, EXPRESS_DEPOSITS_COPY.somethingWentWrong)
    if (isExpressSetupDismissed(message) || /cancel/i.test(message)) {
      return { ok: false, reason: 'canceled', message: EXPRESS_DEPOSITS_COPY.setupDismissed }
    }
    return { ok: false, reason: 'failed', message }
  }
}

export async function checkoutExpressDeposit(input: {
  publishableKey: string
  cryptoCustomerId?: string | null
  method: ExpressCashKind
  usdCredit: number
  pricing: ExpressDepositsPricingBreakdown
  paymentMethods?: ExpressSavedPaymentMethods | null
  onHostElement?: (el: unknown | null) => void
}): Promise<ExpressDepositCheckoutResult> {
  try {
    const pricing = await ensureFreshPricing({
      usdCredit: input.usdCredit,
      method: input.method,
      pricing: input.pricing,
    })

    const paymentMethods = parseExpressSavedPaymentMethods(input.paymentMethods)
    let token =
      expressSavedInstrumentForMethod(paymentMethods, input.method)?.paymentTokenId || null
    if (expressDepositPayNeedsCollect({ method: input.method, paymentMethods })) {
      const collected = await collectExpressPaymentToken({
        publishableKey: input.publishableKey,
        cryptoCustomerId: input.cryptoCustomerId,
        method: input.method,
        amount: pricing.totalToPay,
        currency: pricing.sourceCurrency,
        paymentMethods,
        onHostElement: input.onHostElement,
      })
      if (!collected.ok) {
        return { ok: false, reason: collected.reason, message: collected.message }
      }
      token = collected.paymentTokenId
    }
    if (!token) {
      return { ok: false, reason: 'wrong_token', message: EXPRESS_DEPOSITS_COPY.savePaymentHint }
    }

    const sdk = await loadMobileExpressOnramp(input.publishableKey, input.cryptoCustomerId)
    const authed = await ensureExpressOnrampAuthenticated({
      sdk,
      cryptoCustomerId: input.cryptoCustomerId,
      onHostElement: input.onHostElement,
    })
    if (!authed.ok) {
      return { ok: false, reason: authed.reason === 'canceled' ? 'canceled' : 'failed', message: authed.message }
    }
    const paymentMethod = expressCashKindToPaymentMethod(input.method)
    const created = await apiFetch<{
      session?: { id?: string }
      easnerTransactionId?: string | null
      code?: string
      error?: string
    }>('/api/stripe/onramp/sessions', {
      method: 'POST',
      body: {
        usdCredit: pricing.usdCredit,
        youPay: pricing.quotedAmount ?? pricing.totalToPay,
        amountEntryMode: parseExpressDepositsAmountEntryMode(pricing.amountEntryMode),
        paymentMethod,
        paymentTokenId: token,
      },
    })
    const sessionId = String(created.session?.id || '')
    if (!sessionId) {
      const kind = classifyExpressDepositPayError(created.code, created.error)
      return {
        ok: false,
        reason: kind,
        message: created.error || EXPRESS_DEPOSITS_COPY.paymentFailed,
      }
    }

    if (!sdk.performCheckout) {
      return { ok: false, reason: 'failed', message: EXPRESS_DEPOSITS_COPY.somethingWentWrong }
    }

    const result = await sdk.performCheckout(sessionId, async (id) => {
      const paid = await apiFetch<{ client_secret?: string }>(`/api/stripe/onramp/sessions/${id}`, {
        method: 'POST',
        body: {
          action: 'checkout',
          paymentTokenId: token,
          mandateData: expressDepositCheckoutMandateData(input.method),
        },
      })
      if (!paid.client_secret) throw new Error(EXPRESS_DEPOSITS_COPY.paymentFailed)
      return paid.client_secret
    })

    if (result && result.success === false) {
      await apiFetch(`/api/stripe/onramp/sessions/${sessionId}`, {
        method: 'POST',
        body: { action: 'fail' },
      }).catch(() => undefined)
      return { ok: false, reason: 'failed', message: EXPRESS_DEPOSITS_COPY.paymentFailed }
    }

    const easnerTransactionId = String(created.easnerTransactionId || '').trim() || null
    return { ok: true, easnerTransactionId, pricing }
  } catch (error) {
    const kind = classifyExpressDepositPayError(errorCode(error), errorMessage(error, ''))
    return {
      ok: false,
      reason: kind === 'failed' && isExpressSetupDismissed(errorMessage(error, ''))
        ? 'canceled'
        : kind,
      message: errorMessage(error, EXPRESS_DEPOSITS_COPY.paymentFailed),
    }
  }
}
