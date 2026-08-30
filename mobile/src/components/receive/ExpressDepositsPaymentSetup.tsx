import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import {
  EXPRESS_DEPOSITS_COPY,
  expressDepositSavePaymentHint,
  expressDepositSavePaymentTitle,
  isExpressWalletKind,
  type ExpressDepositFlowParams,
} from '@easner/shared'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { haptics } from '../../lib/haptics'
import SecondaryOutlineButton from '../premium/SecondaryOutlineButton'
import { ReceiveFlowHeader } from './ReceiveFlowHeader'
import { ExpressStripeHost } from './ExpressStripeHost'
import { ExpressPaymentFormSkeleton } from './ExpressPaymentFormSkeleton'
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
      setStripeEl(null)
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

  const stripeReady = Boolean(stripeEl)
  const showSkeleton =
    !error &&
    (Platform.OS === 'web' ? !stripeReady : busy)

  return (
    <View style={[styles.container, { paddingBottom: footerPadding }]}>
      <ReceiveFlowHeader title={expressDepositSavePaymentTitle(params.method)} />
      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.hint}>{expressDepositSavePaymentHint(params.method)}</Text>
          <View style={styles.collectSurface}>
            {showSkeleton ? <ExpressPaymentFormSkeleton /> : null}
            <View style={[styles.hostWrap, !stripeReady && styles.hostHidden]}>
              <ExpressStripeHost element={stripeEl} />
            </View>
          </View>
        </View>
        {error ? (
          <View style={styles.errorBlock}>
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
            {!busy ? (
              <SecondaryOutlineButton
                title={EXPRESS_DEPOSITS_COPY.tryAgainCta}
                onPress={() => {
                  haptics.medium()
                  startedRef.current = false
                  void collect()
                }}
                style={styles.retryButton}
              />
            ) : null}
          </View>
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
  collectSurface: { position: 'relative' },
  hostWrap: {
    width: '100%',
    minHeight: 280,
  },
  hostHidden: {
    ...Platform.select({
      web: {
        position: 'absolute' as const,
        width: 1,
        height: 1,
        overflow: 'hidden' as const,
        opacity: 0,
        pointerEvents: 'none' as const,
      },
      default: {},
    }),
  },
  errorBlock: { gap: spacing[3], marginTop: spacing[2] },
  error: { ...textStyles.caption, color: colors.semantic.destructive },
  retryButton: { flexGrow: 0, flexBasis: 'auto', width: '100%' },
})
