import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  EXPRESS_DEPOSITS_COPY,
  REVIEW_ROW_LABELS,
  buildExpressDepositsReviewRows,
  coalesceExpressSavedPaymentMethods,
  expressPaymentMethodDisplayForMethod,
  expressSavedPaymentTokenForMethod,
  isExpressWalletKind,
  type ExpressDepositFlowParams,
} from '@easner/shared'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import { CreditDestinationRow } from '../transactions/CreditDestinationRow'
import {
  TransactionDetailSummaryRow,
  transactionDetailRowStyles,
} from '../transactions/TransactionDetailSummaryRow'
import { ReceiveFlowHeader } from './ReceiveFlowHeader'
import { ExpressStripeHost } from './ExpressStripeHost'
import { ExpressPaymentMethodRow } from '../payments/ExpressPaymentMethodRow'
import { navigateToTransactionDetailAfterPayIn } from '../../navigation/transactionDetailNavigation'

type ReviewNavigation = Parameters<typeof navigateToTransactionDetailAfterPayIn>[0] & {
  navigate: (name: string, params?: object) => void
}
import { useToast } from '../ToastProvider'
import { checkoutExpressDeposit } from '../../lib/expressDepositCheckout'
import { useExpressOnrampStatus } from '../../hooks/useExpressOnrampStatus'

type Props = {
  navigation: ReviewNavigation
  params: ExpressDepositFlowParams
  footerPadding: number
  listBottomPadding: number
}

export function ExpressDepositsReview({
  navigation,
  params,
  footerPadding,
  listBottomPadding,
}: Props) {
  const { showError } = useToast()
  const express = useExpressOnrampStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeEl, setStripeEl] = useState<unknown>(null)
  const [pricing, setPricing] = useState(params.pricing)
  const paymentMethods = useMemo(
    () => coalesceExpressSavedPaymentMethods(params.paymentMethods, express.paymentMethods),
    [express.paymentMethods, params.paymentMethods],
  )
  const publishableKey = express.publishableKey
  const cryptoCustomerId = express.cryptoCustomerId

  useEffect(() => {
    setPricing(params.pricing)
  }, [params.pricing])

  const paymentMethodDisplay = useMemo(
    () => expressPaymentMethodDisplayForMethod({ method: params.method, paymentMethods }),
    [params.method, paymentMethods],
  )

  const rows = useMemo(
    () => buildExpressDepositsReviewRows({ pricing, method: params.method, surface: 'review' }),
    [params.method, pricing],
  )

  const onPay = async () => {
    if (busy) return
    haptics.medium()
    if (!publishableKey) {
      if (!express.loaded) return
      navigation.navigate('ExpressDepositsSetup')
      return
    }
    setBusy(true)
    setError(null)
    const result = await checkoutExpressDeposit({
      publishableKey,
      cryptoCustomerId,
      method: params.method,
      usdCredit: params.usdCredit,
      pricing,
      paymentMethods,
      paymentTokenId: params.paymentTokenId,
      onHostElement: setStripeEl,
    })
    if (!result.ok) {
      setBusy(false)
      if (result.reason === 'kyc') {
        navigation.navigate('ExpressDepositsSetup')
        return
      }
      if (result.reason === 'wrong_token') {
        if (isExpressWalletKind(params.method)) {
          setError(result.message)
          showError(result.message)
          return
        }
        const hasSavedToken = Boolean(
          expressSavedPaymentTokenForMethod({
            method: params.method,
            paymentMethods,
            paymentTokenId: params.paymentTokenId,
          }),
        )
        if (hasSavedToken) {
          setError(result.message)
          showError(result.message)
          return
        }
        navigation.navigate('ExpressDepositPaymentSetup', {
          ...params,
          pricing,
          paymentMethods,
          forceCollect: true,
        })
        return
      }
      if (result.reason !== 'canceled') {
        setError(result.message)
        showError(result.message)
      }
      return
    }
    setPricing(result.pricing)
    if (result.easnerTransactionId) {
      navigateToTransactionDetailAfterPayIn(navigation, result.easnerTransactionId, 'ReceiveFlow')
      return
    }
    setBusy(false)
    showError(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
  }

  return (
    <View style={[styles.container, { paddingBottom: footerPadding }]}>
      <ReceiveFlowHeader title={EXPRESS_DEPOSITS_COPY.reviewTitle} />
      <View style={styles.body}>
        <ScrollView contentContainerStyle={{ paddingBottom: listBottomPadding }} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            {rows.map((row, index) => {
              if (row.id === 'amount-to-credit') {
                return (
                  <React.Fragment key={row.id}>
                    <TransactionDetailSummaryRow
                      label={row.label}
                      value={row.value}
                      valueBold={row.valueBold}
                    />
                    <CreditDestinationRow
                      label={REVIEW_ROW_LABELS.creditTo}
                      currency="USD"
                      balanceLabel="USD Balance"
                    />
                  </React.Fragment>
                )
              }
              if (row.id === 'deposit-method') {
                const canChange = !isExpressWalletKind(params.method)
                return (
                  <TransactionDetailSummaryRow
                    key={row.id}
                    label={row.label}
                    value={paymentMethodDisplay.accessibilityLabel}
                    last={index === rows.length - 1}
                  >
                    {canChange ? (
                      <Pressable
                        android_ripple={ripple.neutral}
                        style={transactionDetailRowStyles.copyableValueRow}
                        onPressIn={() => haptics.tap()}
                        onPress={() => {
                          navigation.navigate('ExpressDepositPaymentSetup', {
                            ...params,
                            pricing,
                            paymentMethods,
                            forceCollect: true,
                          })
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={EXPRESS_DEPOSITS_COPY.changePaymentCta}
                      >
                        <ExpressPaymentMethodRow display={paymentMethodDisplay} />
                        <Text style={styles.changeCta}>{EXPRESS_DEPOSITS_COPY.changePaymentCta}</Text>
                      </Pressable>
                    ) : (
                      <ExpressPaymentMethodRow display={paymentMethodDisplay} />
                    )}
                  </TransactionDetailSummaryRow>
                )
              }
              return (
                <TransactionDetailSummaryRow
                  key={row.id}
                  label={row.label}
                  value={row.value}
                  valueBold={row.valueBold}
                  last={index === rows.length - 1}
                />
              )
            })}
          </View>
          <ExpressStripeHost element={stripeEl} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        {!stripeEl ? (
          <Pressable
            android_ripple={ripple.neutral}
            style={[styles.cta, busy && styles.ctaDisabled]}
            onPress={() => void onPay()}
            disabled={busy || (!publishableKey && !express.loaded)}
          >
            <LinearGradient
              colors={busy ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              {busy ? (
                <ActivityIndicator color={colors.text.inverse} size="small" />
              ) : (
                <Text style={styles.ctaText}>{EXPRESS_DEPOSITS_COPY.payCta}</Text>
              )}
            </LinearGradient>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: spacing[5] },
  card: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  error: { ...textStyles.caption, color: colors.semantic.destructive, marginTop: spacing[2] },
  changeCta: {
    ...textStyles.bodyMedium,
    color: colors.primary.main,
    flexShrink: 0,
  },
  cta: { borderRadius: borderRadius.lg, overflow: 'hidden', marginTop: spacing[3] },
  ctaDisabled: { opacity: 0.7 },
  ctaGradient: { paddingVertical: spacing[4], alignItems: 'center' },
  ctaText: { ...textStyles.button, color: colors.text.inverse },
})
