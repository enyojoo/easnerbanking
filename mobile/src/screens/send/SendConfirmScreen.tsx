import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, ActivityIndicator } from 'react-native'
import Constants from 'expo-constants'
import { ArrowLeft } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CommonActions, useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import type { Recipient, User } from '../../types'
import { colors, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ToastProvider'
import { useBalance } from '../../contexts/BalanceContext'
import { useScope } from '../../query/scope'
import { apiFetch } from '../../query/api-client'
import { invalidateTransactionsFeed } from '../../query/refresh-user-feeds'
import { executeBalanceSend } from '../../hooks/executeBalanceSend'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'
import { consumeBalanceSendPinVerified, markBalanceSendPinVerified } from '../../lib/sendFlowPostPinGate'
import { hasPin } from '../../lib/pinAuth'
import { analytics } from '../../lib/analytics'
import type { PricingQuote } from '../../lib/noahService'
import { noahService } from '../../lib/noahService'
import { resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'

function inferCountryFromRecipientCurrency(currency: string): string | undefined {
  const m: Record<string, string> = {
    KES: 'KE',
    GHS: 'GH',
    NGN: 'NG',
    ZAR: 'ZA',
  }
  return m[currency.toUpperCase()]
}

function fmtMoney(amount: number, currency: string): string {
  const sym =
    currency === 'USD'
      ? '$'
      : currency === 'EUR'
        ? '€'
        : currency === 'KES'
          ? 'KSh '
          : currency === 'GHS'
            ? '₵ '
            : ''
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Same rule as business `/send/confirm`: client `generateTransactionId()` matches this — no reserve RPC needed. */
function isClientEasnerTransactionIdFormat(value: string): boolean {
  return /^ETID\d{8}$/i.test(value.trim())
}

export default function SendConfirmScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { user, userProfile } = useAuth()
  const { showError, showInfo } = useToast()
  const qc = useQueryClient()
  const { scope } = useScope()
  const { updateBalanceOptimistically } = useBalance()

  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current
  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  const params = route.params as {
    recipient?: Recipient
    calculatedSendingAmount?: number
    calculatedFeeAmount?: number
    calculatedTotalAmount?: number
    receiveAmountValue?: number
    selectedBalanceCurrency?: string
    receiveCurrency?: string
    pricingQuoteId?: string
    pricingQuoteExpiry?: string
    pricingQuoteResult?: PricingQuote | null
    /** Client ETID from Send Amount (same as business); avoids reserve-etid round-trip on confirm when valid. */
    transactionId?: string
  }

  const recipient = params.recipient
  const receiveAmountValue = params.receiveAmountValue ?? 0
  const selectedBalanceCurrency = params.selectedBalanceCurrency ?? 'USD'
  const receiveCurrency = params.receiveCurrency ?? recipient?.currency ?? ''
  const paramTransactionId = typeof params.transactionId === 'string' ? params.transactionId.trim() : ''

  const [pricing, setPricing] = useState(() => ({
    calculatedSendingAmount: params.calculatedSendingAmount ?? 0,
    calculatedFeeAmount: params.calculatedFeeAmount ?? 0,
    calculatedTotalAmount: params.calculatedTotalAmount ?? 0,
    pricingQuoteId: params.pricingQuoteId as string | undefined,
    pricingQuoteExpiry: params.pricingQuoteExpiry as string | undefined,
    pricingQuoteResult: (params.pricingQuoteResult ?? null) as PricingQuote | null,
  }))

  const {
    calculatedSendingAmount,
    calculatedFeeAmount,
    calculatedTotalAmount,
    pricingQuoteId,
    pricingQuoteExpiry,
    pricingQuoteResult,
  } = pricing

  const easetagUi = recipient ? resolveRecipientEasetagForUi(recipient) : ''
  const useLedger =
    Constants.expoConfig?.extra?.easetagLedgerP2pEnabled === true ||
    process.env.EXPO_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true'
  const needReserve = Boolean(useLedger && easetagUi)

  const hasPrefilledClientEtid = needReserve && isClientEasnerTransactionIdFormat(paramTransactionId)

  const [reservedDebitEtid, setReservedDebitEtid] = useState<string | null>(() =>
    hasPrefilledClientEtid ? paramTransactionId.toUpperCase() : null,
  )
  const [reserveError, setReserveError] = useState<string | null>(null)
  const [sendingAfterPin, setSendingAfterPin] = useState(false)

  const canSendEasetagLedger = !needReserve || Boolean(reservedDebitEtid)

  /** Show ETID from amount screen for all balance sends; ledger fallback uses reserve RPC when needed. */
  const displayTransactionId = isClientEasnerTransactionIdFormat(paramTransactionId)
    ? paramTransactionId.toUpperCase()
    : reservedDebitEtid?.trim() || null

  useEffect(() => {
    analytics.trackScreenView('SendConfirm')
  }, [])

  useEffect(() => {
    let cancelled = false
    setReserveError(null)
    if (!recipient || !needReserve) return
    /** Business parity: amount step already generated ETID — show immediately, no reserve RPC. */
    if (isClientEasnerTransactionIdFormat(paramTransactionId)) {
      setReservedDebitEtid(paramTransactionId.toUpperCase())
      return
    }
    setReservedDebitEtid(null)
    void (async () => {
      const r = await noahService.reserveEasnerTransactionId()
      if (cancelled) return
      if (r.ok) setReservedDebitEtid(r.easner_transaction_id)
      else setReserveError(r.error)
    })()
    return () => {
      cancelled = true
    }
  }, [recipient, needReserve, paramTransactionId])

  /** Noah wallet pricing — not used for Easetag P2P (internal ledger); amounts already finalized on the amount screen. */
  useEffect(() => {
    if (!recipient || easetagUi) return
    const sendAmt = pricing.calculatedSendingAmount
    if (!(sendAmt > 0)) return
    let cancelled = false
    void (async () => {
      try {
        const quote = await noahService.createPricingQuote({
          sourceCurrency: selectedBalanceCurrency,
          destinationCurrency: recipient.currency,
          sourceAmount: sendAmt,
          rail: 'wallet',
          countryCode: recipient.country_code,
          payoutCountry: recipient.country_code || inferCountryFromRecipientCurrency(recipient.currency),
        })
        if (cancelled) return
        const feeFromQuote = quote.pricingTotals?.total_user_fee ?? quote.totalFeeAmount
        setPricing((prev) => ({
          ...prev,
          calculatedFeeAmount: feeFromQuote,
          calculatedTotalAmount: sendAmt + feeFromQuote,
          pricingQuoteId: quote.quoteId,
          pricingQuoteExpiry: quote.expiresAt,
          pricingQuoteResult: quote,
        }))
      } catch {
        // Keep FX-engine fallback from the amount screen
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    easetagUi,
    recipient?.id,
    recipient?.currency,
    recipient?.country_code,
    selectedBalanceCurrency,
    pricing.calculatedSendingAmount,
  ])

  useFocusEffect(
    useCallback(() => {
      if (!consumeBalanceSendPinVerified()) return
      if (!recipient || !user?.id) {
        markBalanceSendPinVerified()
        return
      }

      let cancelled = false
      let finished = false

      void (async () => {
        setSendingAfterPin(true)
        try {
          const { detailId } = await executeBalanceSend(
            {
              recipient,
              calculatedTotalAmount,
              receiveAmountValue,
              selectedBalanceCurrency,
              pricingQuoteId,
              pricingQuoteExpiry,
              pricingQuoteResult,
              ...(reservedDebitEtid?.trim() ? { reservedDebitEtid: reservedDebitEtid.trim() } : {}),
            },
            {
              userId: user.id,
              userProfile: userProfile as User | null | undefined,
              scope: scope ?? undefined,
              qc,
              updateBalanceOptimistically,
              showError,
              showInfo,
            },
          )
          if (cancelled) return
          const txId = String(detailId ?? '').trim()
          if (!txId) {
            throw new Error('Transfer succeeded but no transaction ID was returned.')
          }

          if (scope) {
            void qc
              .prefetchQuery({
                queryKey: qk.transactions.detail(scope, txId),
                queryFn: () =>
                  apiFetch<{ transaction?: unknown }>(`/api/transactions/${encodeURIComponent(txId)}`, {
                    headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
                  }),
              })
              .catch(() => {})
          }

          finished = true
          navigation.dispatch(
            CommonActions.reset({
              index: 1,
              routes: [
                { name: 'MainTabs' },
                {
                  name: 'TransactionDetails',
                  params: { transactionId: txId, fromScreen: 'SendFlow' },
                },
              ],
            }),
          )

          if (scope && user.id) {
            void invalidateTransactionsFeed(qc, scope, user.id).catch(() => {})
          }
        } catch (e: unknown) {
          if (!cancelled) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
            showError(e instanceof Error ? e.message : 'Transfer failed.')
          }
        } finally {
          if (!cancelled) setSendingAfterPin(false)
        }
      })()

      return () => {
        cancelled = true
        if (!finished) markBalanceSendPinVerified()
      }
    }, [
      calculatedTotalAmount,
      navigation,
      pricingQuoteExpiry,
      pricingQuoteId,
      pricingQuoteResult,
      qc,
      receiveAmountValue,
      recipient,
      reservedDebitEtid,
      scope,
      selectedBalanceCurrency,
      showError,
      showInfo,
      updateBalanceOptimistically,
      user?.id,
      userProfile,
    ]),
  )

  const onConfirmPress = async () => {
    if (!recipient || sendingAfterPin) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (!user?.id) {
      showError('Not authenticated.')
      return
    }
    if (!(await hasPin(user.id))) {
      showError('Set an app PIN in Settings before authorizing transfers.')
      return
    }
    navigation.navigate('SendPin' as never, {
      recipient,
      calculatedSendingAmount: pricing.calculatedSendingAmount,
      calculatedFeeAmount: pricing.calculatedFeeAmount,
      calculatedTotalAmount: pricing.calculatedTotalAmount,
      receiveAmountValue,
      selectedBalanceCurrency,
      receiveCurrency,
      pricingQuoteId: pricing.pricingQuoteId,
      pricingQuoteExpiry: pricing.pricingQuoteExpiry,
      pricingQuoteResult: pricing.pricingQuoteResult,
      ...(reservedDebitEtid?.trim() ? { reservedDebitEtid: reservedDebitEtid.trim() } : {}),
    } as never)
  }

  if (!recipient) {
    return (
      <ScreenWrapper>
        <View style={[styles.container, { paddingBottom: insets.bottom + spacing[4] }]}>
          <Text style={textStyles.body}>Nothing to confirm.</Text>
          <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing[4] }}>
            <Text style={{ color: colors.primary.main }}>Go back</Text>
          </Pressable>
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <View style={[styles.container, { paddingBottom: insets.bottom + spacing[4] }]}>
        <Animated.View
          style={[
            styles.header,
            {
              opacity: headerAnim,
              transform: [
                {
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-motion.screenEnterTranslateY, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            android_ripple={ripple.neutral}
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            disabled={sendingAfterPin}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Review transfer</Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.contentWrap,
            {
              opacity: contentAnim,
              transform: [
                {
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [motion.screenEnterTranslateY, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <Row label="You send" value={`${fmtMoney(calculatedSendingAmount, selectedBalanceCurrency)} ${selectedBalanceCurrency}`} />
              <Row label="Fees" value={fmtMoney(calculatedFeeAmount, selectedBalanceCurrency)} />
              <Row label="Total debited" value={`${fmtMoney(calculatedTotalAmount, selectedBalanceCurrency)} ${selectedBalanceCurrency}`} bold />
              <Row label="Recipient gets" value={`${fmtMoney(receiveAmountValue, receiveCurrency)} ${receiveCurrency}`} />
              <Row
                label="To"
                value={recipient.full_name}
                last={!displayTransactionId && !pricingQuoteExpiry}
              />
              {displayTransactionId ? (
                <Row label="Transaction ID" value={displayTransactionId} last={!pricingQuoteExpiry} />
              ) : null}
              {needReserve && !isClientEasnerTransactionIdFormat(paramTransactionId) ? (
                reserveError ? (
                  <Text style={styles.reserveError}>Could not reserve transaction ID ({reserveError}). Try again later.</Text>
                ) : !reservedDebitEtid ? (
                  <Text style={styles.quoteHint}>Reserving transaction ID…</Text>
                ) : null
              ) : null}
              {pricingQuoteExpiry ? (
                <Text style={styles.quoteHint}>Quote expires {new Date(pricingQuoteExpiry).toLocaleTimeString()}</Text>
              ) : null}
            </View>
          </ScrollView>
        </Animated.View>

        <Pressable
          android_ripple={ripple.neutral}
          style={[styles.cta, (!canSendEasetagLedger || reserveError) && styles.ctaDisabled]}
          onPress={() => void onConfirmPress()}
          disabled={!canSendEasetagLedger || Boolean(reserveError) || sendingAfterPin}
        >
          <LinearGradient
            colors={
              !canSendEasetagLedger || reserveError
                ? [colors.neutral[400], colors.neutral[400]]
                : colors.primary.gradient
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            {sendingAfterPin ? (
              <View style={styles.ctaSendingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.ctaText}>Sending…</Text>
              </View>
            ) : (
              <Text style={styles.ctaText}>Confirm & Send</Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </ScreenWrapper>
  )
}

function Row({ label, value, bold, last }: { label: string; value: string; bold?: boolean; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: spacing[5],
  },
  scrollContent: {
    paddingBottom: spacing[4],
  },
  card: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
    paddingBottom: spacing[3],
    marginBottom: spacing[3],
  },
  rowLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 0,
  },
  rowLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flexShrink: 0,
  },
  rowValue: {
    ...textStyles.body,
    color: colors.text.primary,
    textAlign: 'right',
    flex: 1,
  },
  rowValueBold: {
    fontFamily: fontFamily.semibold,
  },
  quoteHint: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    marginTop: spacing[2],
  },
  reserveError: {
    ...textStyles.caption,
    color: colors.error.main,
    marginTop: spacing[2],
  },
  cta: {
    marginTop: spacing[2],
    marginHorizontal: spacing[5],
  },
  ctaDisabled: {
    opacity: 0.85,
  },
  ctaGradient: {
    borderRadius: borderRadius.full,
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaSendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  ctaText: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    color: '#fff',
  },
})
