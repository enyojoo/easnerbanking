import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable, TextInput } from 'react-native'
import {
  EXPRESS_DEPOSITS_COPY,
  expressDepositMethodTitle,
  expressDepositsQuoteIsStale,
  formatMoneyDisplay,
  formatSendRateLabel,
  useExpressDepositsAmountLimits,
  validateExpressDepositsAmount,
  type ExpressDepositsPricingBreakdown,
} from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles, surfaceFrameStyle } from '../../theme'
import { ReceiveFlowHeader } from '../../components/receive/ReceiveFlowHeader'
import { analytics } from '../../lib/analytics'
import { ExpressDepositsReviewSection } from '../../components/receive/ExpressDepositsReviewSection'
import { useStackHardwareBack } from '../../hooks/useStackHardwareBack'
import { navigateStackBack } from '../../navigation/stackBackNavigation'
import { navigateToTransactionDetailAfterPayIn } from '../../navigation/transactionDetailNavigation'
import { apiFetch } from '../../query/api-client'
import { CenteredWebFlowPage } from '../../components/layout/CenteredWebFlowPage'
import type { ExpressCashKind } from '../../components/receive/ReceiveCashMethodList'
import { loadMobileExpressOnramp } from '../../lib/express-onramp'
import { isStripeHostElement } from '../../lib/expressStripeElement'
import { ExpressStripeHost } from '../../components/receive/ExpressStripeHost'

export default function ExpressDepositAmountScreen({ navigation, route }: NavigationProps) {
  const method = ((route.params as { method?: ExpressCashKind } | undefined)?.method ||
    'express_card') as ExpressCashKind
  const [amount, setAmount] = useState('50')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'amount' | 'review' | 'complete'>('amount')
  const [pricing, setPricing] = useState<ExpressDepositsPricingBreakdown | null>(null)
  const [sourceCurrency, setSourceCurrency] = useState('USD')
  const [ready, setReady] = useState(false)
  const [publishableKey, setPublishableKey] = useState<string | null>(null)
  const [cryptoCustomerId, setCryptoCustomerId] = useState<string | null>(null)
  const [paymentTokenId, setPaymentTokenId] = useState<string | null>(null)
  const [last4, setLast4] = useState<string | null>(null)
  const [stripeEl, setStripeEl] = useState<unknown>(null)

  const handleBack = useCallback(() => navigateStackBack(navigation), [navigation])
  useStackHardwareBack(handleBack)

  const usdCredit = Number.parseFloat(amount) || 0
  const youPay = pricing?.totalToPay ?? null
  const amountLimit = validateExpressDepositsAmount({
    usdCredit,
    youPay,
    sourceCurrency,
  })
  const amountLimitError = usdCredit > 0 && !amountLimit.ok ? amountLimit.message : null
  useExpressDepositsAmountLimits({
    enabled: step === 'amount' && ready,
    usdCredit,
    youPay,
    sourceCurrency,
    onApplyUsdCredit: (next) => setAmount((Math.round(next * 100) / 100).toFixed(2)),
  })
  const paymentMethod =
    method === 'express_ach'
      ? 'ach'
      : method === 'express_apple_pay'
        ? 'apple_pay'
        : method === 'express_google_pay'
          ? 'google_pay'
          : 'card'

  const fetchQuote = useCallback(async (): Promise<ExpressDepositsPricingBreakdown | null> => {
    const data = await apiFetch<{
      pricing?: ExpressDepositsPricingBreakdown
      sourceCurrency?: string
      error?: string
    }>('/api/stripe/onramp/quote', {
      method: 'POST',
      body: { usdCredit, paymentMethod },
    })
    if (data.sourceCurrency) setSourceCurrency(data.sourceCurrency.toUpperCase())
    if (data.pricing) {
      setPricing(data.pricing)
      return data.pricing
    }
    setPricing(null)
    return null
  }, [usdCredit, paymentMethod])

  useEffect(() => {
    void apiFetch<{
      ready?: boolean
      publishableKey?: string
      paymentTokenId?: string | null
      sourceCurrency?: string
      cryptoCustomerId?: string | null
    }>('/api/stripe/onramp/status').then((data) => {
      setReady(Boolean(data.ready))
      setPublishableKey(data.publishableKey ?? null)
      setPaymentTokenId(data.paymentTokenId ?? null)
      setCryptoCustomerId(data.cryptoCustomerId ?? null)
      if (data.sourceCurrency) setSourceCurrency(data.sourceCurrency.toUpperCase())
    })
  }, [])

  useEffect(() => {
    if (!(usdCredit > 0) || !ready || !amountLimit.ok) {
      setPricing(null)
      return
    }
    const t = setTimeout(() => {
      void fetchQuote().catch(() => setPricing(null))
    }, 400)
    return () => clearTimeout(t)
  }, [amountLimit.ok, fetchQuote, ready, usdCredit])

  const handleContinue = () => {
    if (!ready) {
      navigation.navigate('ExpressDepositsSetup' as never)
      return
    }
    if (!amountLimit.ok) {
      setError(amountLimit.message)
      return
    }
    if (!pricing) {
      setError(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      return
    }
    setStep('review')
    analytics.trackExpressDepositStarted({ method, currency: sourceCurrency })
  }

  const ensureFreshPricing = async (): Promise<ExpressDepositsPricingBreakdown> => {
    if (pricing && !expressDepositsQuoteIsStale(pricing.rateFetchedAt)) return pricing
    const next = await fetchQuote()
    if (!next) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
    const limit = validateExpressDepositsAmount({
      usdCredit,
      youPay: next.totalToPay,
      sourceCurrency: next.sourceCurrency,
    })
    if (!limit.ok) throw new Error(limit.message)
    return next
  }

  const handlePay = async () => {
    setBusy(true)
    setError(null)
    try {
      const freshPricing = await ensureFreshPricing()
      if (!publishableKey) throw new Error(EXPRESS_DEPOSITS_COPY.setupRequiredHint)
      const sdk = await loadMobileExpressOnramp(publishableKey, cryptoCustomerId)
      let token = paymentTokenId
      if (!token && sdk.collectPaymentMethod) {
        await new Promise<void>((resolve, reject) => {
          void sdk
            .collectPaymentMethod?.(
              {
                payment_method_types: method === 'express_ach' ? ['us_bank_account'] : ['card'],
                wallets: {
                  applePay: method === 'express_apple_pay' ? 'auto' : 'never',
                  googlePay: method === 'express_google_pay' ? 'auto' : 'never',
                },
                amount: freshPricing.totalToPay,
                currency: freshPricing.sourceCurrency,
              },
              async (result) => {
                if (!result.cryptoPaymentToken) {
                  setStripeEl(null)
                  reject(new Error(EXPRESS_DEPOSITS_COPY.savePaymentHint))
                  return
                }
                token = result.cryptoPaymentToken
                setPaymentTokenId(token)
                const card = result.paymentMethodDetails?.card as { last4?: string } | undefined
                setLast4(card?.last4 || null)
                await apiFetch('/api/stripe/onramp/payment-tokens', {
                  method: 'POST',
                  body: { paymentTokenId: token },
                })
                setStripeEl(null)
                resolve()
              },
            )
            .then((el) => {
              if (isStripeHostElement(el)) {
                setStripeEl(el)
                setBusy(false)
              }
            })
            .catch(reject)
        })
      }
      setBusy(true)
      const created = await apiFetch<{ session?: { id?: string }; easnerTransactionId?: string | null }>(
        '/api/stripe/onramp/sessions',
        {
          method: 'POST',
          body: { usdCredit, paymentMethod, paymentTokenId: token },
        },
      )
      const id = created.session?.id
      const transactionId = String(created.easnerTransactionId || '').trim()
      if (!id) throw new Error('Could not start payment')
      if (sdk.performCheckout) {
        await sdk.performCheckout(id, async (sessionId) => {
          const paid = await apiFetch<{ client_secret?: string }>(`/api/stripe/onramp/sessions/${sessionId}`, {
            method: 'POST',
            body: { action: 'checkout', paymentTokenId: token },
          })
          if (!paid.client_secret) throw new Error(EXPRESS_DEPOSITS_COPY.paymentFailed)
          return paid.client_secret
        })
      } else {
        throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      }
      if (transactionId) {
        analytics.trackExpressDepositCompleted({ method, currency: freshPricing.sourceCurrency })
        navigateToTransactionDetailAfterPayIn(navigation, transactionId, 'ReceiveFlow')
        return
      }
      setStep('complete')
    } catch (e) {
      setError(e instanceof Error ? e.message : EXPRESS_DEPOSITS_COPY.paymentFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScreenWrapper>
      <CenteredWebFlowPage>
        <ReceiveFlowHeader title={expressDepositMethodTitle(method)} onBack={handleBack} />
        <View style={styles.body}>
          {step === 'amount' ? (
            <>
              <Text style={styles.label}>{EXPRESS_DEPOSITS_COPY.youGet}</Text>
              <TextInput
                style={styles.amount}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
              {pricing?.exchangeRate && pricing.exchangeRate.rate > 0 ? (
                <Text style={styles.label}>
                  {formatSendRateLabel(
                    pricing.exchangeRate.from,
                    pricing.exchangeRate.to,
                    pricing.exchangeRate.rate,
                  )}
                </Text>
              ) : null}
              {pricing ? (
                <Text style={styles.label}>
                  {EXPRESS_DEPOSITS_COPY.estimatedTotalToPay}:{' '}
                  {formatMoneyDisplay(pricing.totalToPay, pricing.sourceCurrency)}
                </Text>
              ) : null}
              <Pressable
                style={styles.pay}
                disabled={!(usdCredit > 0) || Boolean(amountLimitError) || !pricing}
                onPress={handleContinue}
              >
                <Text style={styles.payText}>{EXPRESS_DEPOSITS_COPY.continueCta}</Text>
              </Pressable>
            </>
          ) : null}
          {step === 'review' && pricing ? (
            <>
              <ExpressDepositsReviewSection pricing={pricing} method={method} />
              <ExpressStripeHost element={stripeEl} />
              {!stripeEl ? (
                <Pressable style={styles.pay} disabled={busy} onPress={() => void handlePay()}>
                  {busy ? (
                    <ActivityIndicator color={colors.neutral.white} />
                  ) : (
                    <Text style={styles.payText}>{EXPRESS_DEPOSITS_COPY.payCta}</Text>
                  )}
                </Pressable>
              ) : null}
            </>
          ) : null}
          {step === 'complete' && pricing ? (
            <>
              <Text style={styles.amount}>{EXPRESS_DEPOSITS_COPY.completeTitle}</Text>
              <ExpressDepositsReviewSection pricing={pricing} method={method} />
              {last4 ? <Text style={styles.label}>···· {last4}</Text> : null}
              <Pressable style={styles.pay} onPress={handleBack}>
                <Text style={styles.payText}>Done</Text>
              </Pressable>
            </>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </CenteredWebFlowPage>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  body: {
    padding: spacing[5],
    gap: spacing[3],
  },
  label: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  amount: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  pay: {
    ...surfaceFrameStyle(colors),
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    paddingVertical: spacing[4],
  },
  payText: {
    ...textStyles.bodyMedium,
    color: colors.neutral.white,
    fontWeight: '600',
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.error.main,
  },
})
