import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, ActivityIndicator } from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import Constants from 'expo-constants'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CommonActions, useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { findPayoutFieldsSchema, formatPayoutArrivalHint, qk } from '@easner/shared'
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
import { consumeBalanceSendPinVerified } from '../../lib/sendFlowPostPinGate'
import { hasPin } from '../../lib/pinAuth'
import { analytics } from '../../lib/analytics'
import type { PricingQuote } from '../../lib/noahService'
import { noahService } from '../../lib/noahService'
import type { PayoutPrepareSession } from '../../hooks/executeBalanceSend'
import { resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'
import { isMobileMoneyRecipient } from '../../lib/recipientPayoutPreview'
import { getCachedSendDestinations } from '../../lib/sendDestinations'
import { isEasnerClientTransactionIdFormat } from '../../lib/transactionId'

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
    /** Same ETID through review → PIN → transfer (`reserved_debit_etid` on ledger P2P). */
    transactionId?: string
    note?: string
    paymentPurpose?: string
  }

  const recipient = params.recipient
  const receiveAmountValue = params.receiveAmountValue ?? 0
  const selectedBalanceCurrency = params.selectedBalanceCurrency ?? 'USD'
  const receiveCurrency = params.receiveCurrency ?? recipient?.currency ?? ''
  const paramTransactionId = typeof params.transactionId === 'string' ? params.transactionId.trim() : ''
  const sendNote = typeof params.note === 'string' ? params.note.trim() : ''
  const sendPaymentPurpose = typeof params.paymentPurpose === 'string' ? params.paymentPurpose.trim() : ''

  const [pricing, setPricing] = useState(() => ({
    calculatedSendingAmount: params.calculatedSendingAmount ?? 0,
    calculatedFeeAmount: params.calculatedFeeAmount ?? 0,
    calculatedTotalAmount: params.calculatedTotalAmount ?? 0,
    noahFee: 0,
    easnerFee: 0,
    pricingQuoteId: params.pricingQuoteId as string | undefined,
    pricingQuoteExpiry: params.pricingQuoteExpiry as string | undefined,
    pricingQuoteResult: (params.pricingQuoteResult ?? null) as PricingQuote | null,
    payoutSession: undefined as PayoutPrepareSession | undefined,
    quoteLoading: false,
    quoteError: null as string | null,
  }))

  const {
    calculatedSendingAmount,
    calculatedFeeAmount,
    calculatedTotalAmount,
    noahFee,
    easnerFee,
    pricingQuoteId,
    pricingQuoteExpiry,
    pricingQuoteResult,
    payoutSession,
    quoteLoading,
    quoteError,
  } = pricing

  const easetagUi = recipient ? resolveRecipientEasetagForUi(recipient) : ''
  const sendDestinations = getCachedSendDestinations()
  const payoutRail = recipient && isMobileMoneyRecipient(recipient) ? 'mobile_money' : 'bank_transfer'
  const payoutHints =
    sendDestinations && recipient?.country_code
      ? findPayoutFieldsSchema(
          payoutRail === 'mobile_money'
            ? sendDestinations.fiat.mobile_money
            : sendDestinations.fiat.bank_transfer,
          {
            countryCode: recipient.country_code,
            currencyCode: recipient.currency,
            rail: payoutRail,
          },
        )
      : null
  const arrivalHint = formatPayoutArrivalHint(payoutHints?.processing_seconds)
  const useLedger =
    Constants.expoConfig?.extra?.easetagLedgerP2pEnabled === true ||
    process.env.EXPO_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true'
  const ledgerReservedDebitEtid =
    useLedger &&
    easetagUi &&
    paramTransactionId &&
    isEasnerClientTransactionIdFormat(paramTransactionId)
      ? paramTransactionId.toUpperCase()
      : undefined

  const displayTransactionId = paramTransactionId ? paramTransactionId.toUpperCase() : null

  const [sendingAfterPin, setSendingAfterPin] = useState(false)

  useEffect(() => {
    analytics.trackScreenView('SendConfirm')
  }, [])

  /** Executable Noah payout quote at confirm (Noah sell/prepare). Skipped for Easetag P2P. */
  useEffect(() => {
    if (!recipient || easetagUi) return
    if (!recipient.id || !(receiveAmountValue > 0)) return
    let cancelled = false
    setPricing((prev) => ({ ...prev, quoteLoading: true, quoteError: null }))
    void (async () => {
      try {
        const pq = await noahService.createPayoutQuote({
          recipientId: recipient.id,
          receiveAmount: receiveAmountValue,
          sourceBalanceCurrency: selectedBalanceCurrency,
          ...(sendNote ? { note: sendNote } : {}),
          ...(sendPaymentPurpose ? { paymentPurpose: sendPaymentPurpose } : {}),
        })
        if (cancelled) return
        const easnerFeeAmt =
          pq.easner.pricingTotals?.total_easner_fee ??
          pq.easner.totalFeeAmount ??
          0
        setPricing((prev) => ({
          ...prev,
          calculatedSendingAmount: pq.sendAmount,
          noahFee: pq.noah.totalFee,
          easnerFee: easnerFeeAmt,
          calculatedFeeAmount: easnerFeeAmt,
          calculatedTotalAmount: pq.totalDebited,
          pricingQuoteId: pq.pricingQuoteId,
          pricingQuoteExpiry: pq.expiresAt,
          pricingQuoteResult: pq.easner,
          payoutSession: {
            formSessionId: pq.noah.formSessionId,
            cryptoAuthorizedAmount: pq.noah.cryptoAuthorizedAmount,
            cryptoCurrency: pq.noah.cryptoCurrency,
            ...(pq.channelId ? { channelId: pq.channelId } : {}),
          },
          quoteLoading: false,
          quoteError: null,
        }))
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Could not load payout quote'
        setPricing((prev) => ({ ...prev, quoteLoading: false, quoteError: msg }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [easetagUi, recipient?.id, recipient?.currency, selectedBalanceCurrency, receiveAmountValue, sendNote, sendPaymentPurpose])

  useFocusEffect(
    useCallback(() => {
      if (!consumeBalanceSendPinVerified()) return
      if (!recipient || !user?.id) return

      let cancelled = false

      void (async () => {
        setSendingAfterPin(true)
        try {
          const { detailId } = await executeBalanceSend(
            {
              recipient,
              calculatedTotalAmount,
              receiveAmountValue,
              selectedBalanceCurrency,
              ...(payoutSession ? { payoutSession } : {}),
              ...(ledgerReservedDebitEtid ? { reservedDebitEtid: ledgerReservedDebitEtid } : {}),
              ...(sendNote ? { note: sendNote } : {}),
              ...(sendPaymentPurpose ? { paymentPurpose: sendPaymentPurpose } : {}),
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
      }
    }, [
      calculatedTotalAmount,
      navigation,
      payoutSession,
      qc,
      receiveAmountValue,
      recipient,
      ledgerReservedDebitEtid,
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
    if (quoteLoading) {
      showError('Loading payout quote…')
      return
    }
    if (quoteError && !easetagUi) {
      showError(quoteError)
      return
    }
    navigation.navigate('SendPin' as never)
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
              {!easetagUi && (noahFee > 0 || quoteLoading) ? (
                <Row
                  label="Noah fee"
                  value={quoteLoading ? '…' : fmtMoney(noahFee, selectedBalanceCurrency)}
                />
              ) : null}
              {!easetagUi ? (
                <Row
                  label="Easner fee"
                  value={quoteLoading ? '…' : fmtMoney(easnerFee || calculatedFeeAmount, selectedBalanceCurrency)}
                />
              ) : (
                <Row label="Fees" value={fmtMoney(calculatedFeeAmount, selectedBalanceCurrency)} />
              )}
              <Row label="Total debited" value={`${fmtMoney(calculatedTotalAmount, selectedBalanceCurrency)} ${selectedBalanceCurrency}`} bold />
              <Row label="Recipient gets" value={`${fmtMoney(receiveAmountValue, receiveCurrency)} ${receiveCurrency}`} />
              {arrivalHint && !easetagUi ? (
                <Row label="Arrival" value={arrivalHint} />
              ) : null}
              <Row
                label="To"
                value={recipient.full_name}
                last={!displayTransactionId && !pricingQuoteExpiry}
              />
              {displayTransactionId ? (
                <Row label="Transaction ID" value={displayTransactionId} last={!pricingQuoteExpiry} />
              ) : null}
              {quoteError ? <Text style={styles.quoteError}>{quoteError}</Text> : null}
              {pricingQuoteExpiry ? (
                <Text style={styles.quoteHint}>Quote expires {new Date(pricingQuoteExpiry).toLocaleTimeString()}</Text>
              ) : null}
            </View>
          </ScrollView>
        </Animated.View>

        <Pressable
          android_ripple={ripple.neutral}
          style={[styles.cta, sendingAfterPin && styles.ctaDisabled]}
          onPress={() => void onConfirmPress()}
          disabled={sendingAfterPin}
        >
          <LinearGradient
            colors={sendingAfterPin ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
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
  quoteError: {
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
