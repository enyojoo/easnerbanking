import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  EXPRESS_DEPOSITS_COPY,
  isExpressWalletKind,
  type ExpressDepositFlowParams,
} from '@easner/shared'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import { ReceiveFlowHeader } from './ReceiveFlowHeader'
import { ExpressStripeHost } from './ExpressStripeHost'
import { collectExpressPaymentToken } from '../../lib/expressDepositCheckout'
import { useExpressOnrampStatus } from '../../hooks/useExpressOnrampStatus'

type Props = {
  navigation: {
    goBack: () => void
    navigate: (name: string, params?: object) => void
    replace: (name: string, params?: object) => void
  }
  params: ExpressDepositFlowParams
  footerPadding: number
}

export function ExpressDepositsPaymentSetup({ navigation, params, footerPadding }: Props) {
  const { publishableKey, cryptoCustomerId, loaded } = useExpressOnrampStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeEl, setStripeEl] = useState<unknown>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (isExpressWalletKind(params.method)) {
      navigation.replace('ExpressDepositReview', params)
    }
  }, [navigation, params])

  useEffect(() => {
    if (loaded && !publishableKey) setError(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
  }, [loaded, publishableKey])

  const collect = useCallback(async () => {
    if (!publishableKey || busy) return
    setBusy(true)
    setError(null)
    const result = await collectExpressPaymentToken({
      publishableKey,
      cryptoCustomerId,
      method: params.method,
      paymentMethods: params.paymentMethods,
      onHostElement: setStripeEl,
    })
    if (!result.ok) {
      setBusy(false)
      if (result.reason !== 'canceled') setError(result.message)
      return
    }
    const nextParams = {
      ...params,
      paymentMethods: result.paymentMethods,
      paymentTokenId: result.paymentTokenId,
      forceCollect: false,
    }
    if (params.forceCollect) {
      navigation.navigate('ExpressDepositReview', nextParams)
    } else {
      navigation.replace('ExpressDepositReview', nextParams)
    }
    setBusy(false)
  }, [busy, cryptoCustomerId, navigation, params, publishableKey])

  useEffect(() => {
    startedRef.current = false
  }, [params.forceCollect, params.method])

  useEffect(() => {
    if (!publishableKey || startedRef.current || isExpressWalletKind(params.method)) return
    startedRef.current = true
    void collect()
  }, [collect, params.forceCollect, params.method, publishableKey])

  return (
    <View style={[styles.container, { paddingBottom: footerPadding }]}>
      <ReceiveFlowHeader title={EXPRESS_DEPOSITS_COPY.savePaymentTitle} />
      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.hint}>{EXPRESS_DEPOSITS_COPY.savePaymentHint}</Text>
          <ExpressStripeHost element={stripeEl} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!stripeEl ? (
          <Pressable
            android_ripple={ripple.neutral}
            style={[styles.cta, busy && styles.ctaDisabled]}
            onPress={() => {
              haptics.medium()
              void collect()
            }}
            disabled={busy || !publishableKey}
          >
            <LinearGradient
              colors={busy || !publishableKey ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              {busy ? (
                <ActivityIndicator color={colors.text.inverse} size="small" />
              ) : (
                <Text style={styles.ctaText}>{EXPRESS_DEPOSITS_COPY.continueCta}</Text>
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
    gap: spacing[3],
  },
  hint: { ...textStyles.body, color: colors.text.secondary },
  error: { ...textStyles.caption, color: colors.semantic.destructive, marginTop: spacing[2] },
  cta: { borderRadius: borderRadius.lg, overflow: 'hidden', marginTop: spacing[3] },
  ctaDisabled: { opacity: 0.7 },
  ctaGradient: { paddingVertical: spacing[4], alignItems: 'center' },
  ctaText: { ...textStyles.button, color: colors.text.inverse },
})
