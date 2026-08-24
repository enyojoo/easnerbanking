import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable, TextInput } from 'react-native'
import {
  EXPRESS_DEPOSITS_COPY,
  expressDepositMethodTitle,
  formatMoneyDisplay,
  useExpressDepositsAmountLimits,
  validateExpressDepositsAmount,
} from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles, surfaceFrameStyle } from '../../theme'
import { ReceiveFlowHeader } from '../../components/receive/ReceiveFlowHeader'
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
  const [youPay, setYouPay] = useState<number | null>(null)
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
    if (!(usdCredit > 0) || !ready || !amountLimit.ok) return
    const t = setTimeout(() => {
      void apiFetch<{
        source_total_amount?: string
        source_amount?: string
        sourceCurrency?: string
        quotes?: Array<{ source_total_amount?: string; source_amount?: string }>
      }>('/api/stripe/onramp/quote', {
        method: 'POST',
        body: { usdCredit, paymentMethod },
      })
        .then((data) => {
          if (data.sourceCurrency) setSourceCurrency(data.sourceCurrency.toUpperCase())
          const pay = Number(
            data.source_total_amount ??
              data.source_amount ??
              data.quotes?.[0]?.source_total_amount ??
              data.quotes?.[0]?.source_amount ??
              usdCredit,
          )
          setYouPay(Number.isFinite(pay) && pay > 0 ? pay : usdCredit)
        })
        .catch(() => setYouPay(usdCredit))
    }, 400)
    return () => clearTimeout(t)
  }, [amountLimit.ok, usdCredit, paymentMethod, ready])

  const handleContinue = () => {
    if (!ready) {
      navigation.navigate('ExpressDepositsSetup' as never)
      return
    }
    if (!amountLimit.ok) {
      setError(amountLimit.message)
      return
    }
    setStep('review')
  }

  const handlePay = async () => {
    setBusy(true)
    setError(null)
    try {
      if (!amountLimit.ok) throw new Error(amountLimit.message)
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
                amount: youPay,
                currency: 'USD',
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
          body: { usdCredit, sourceAmount: youPay, paymentMethod, paymentTokenId: token },
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
              {youPay ? (
                <Text style={styles.label}>
                  {EXPRESS_DEPOSITS_COPY.youPay}: {formatMoneyDisplay(youPay, sourceCurrency)}
                </Text>
              ) : null}
              <Pressable
                style={styles.pay}
                disabled={!(usdCredit > 0) || Boolean(amountLimitError)}
                onPress={handleContinue}
              >
                <Text style={styles.payText}>{EXPRESS_DEPOSITS_COPY.continueCta}</Text>
              </Pressable>
            </>
          ) : null}
          {step === 'review' ? (
            <>
              <Text style={styles.label}>
                {EXPRESS_DEPOSITS_COPY.youGet}: {formatMoneyDisplay(usdCredit, 'USD')}
              </Text>
              <Text style={styles.label}>
                {EXPRESS_DEPOSITS_COPY.youPay}: {formatMoneyDisplay(youPay ?? usdCredit, sourceCurrency)}
              </Text>
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
          {step === 'complete' ? (
            <>
              <Text style={styles.amount}>{EXPRESS_DEPOSITS_COPY.completeTitle}</Text>
              <Text style={styles.label}>
                {EXPRESS_DEPOSITS_COPY.youGet}: {formatMoneyDisplay(usdCredit, 'USD')}
              </Text>
              <Text style={styles.label}>
                {EXPRESS_DEPOSITS_COPY.youPay}: {formatMoneyDisplay(youPay ?? usdCredit, sourceCurrency)}
              </Text>
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
