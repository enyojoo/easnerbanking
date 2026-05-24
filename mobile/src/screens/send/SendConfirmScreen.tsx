import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, ActivityIndicator } from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import Constants from 'expo-constants'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CommonActions, useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import {
  computeBalancePayoutExchangeFee,
  findPayoutFieldsSchema,
  formatMoneyDisplay,
  formatPayoutArrivalHint,
  getSendAmountNoteFieldUi,
  qk,
} from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import type { Recipient, User } from '../../types'
import {
  colors,
  surfaceChromeCircleStyle,
  textStyles,
  borderRadius,
  spacing,
  motion,
  fontFamily,
} from '../../theme'
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
import { useEasenetRecipientHydration } from '../../hooks/useEasenetRecipientHydration'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { SendSelectedRecipientSummary } from '../../components/send/SendSelectedRecipientSummary'
import { getCachedSendDestinations } from '../../lib/sendDestinations'
import { isEasnerClientTransactionIdFormat } from '../../lib/transactionId'
import {
  isStashedPayoutQuoteFresh,
  peekSendPayoutQuote,
  clearSendPayoutQuote,
} from '../../lib/sendFlowPayoutQuote'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'

function inferCountryFromRecipientCurrency(currency: string): string | undefined {
  const m: Record<string, string> = {
    KES: 'KE',
    GHS: 'GH',
    NGN: 'NG',
    ZAR: 'ZA',
  }
  return m[currency.toUpperCase()]
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

  const amountScreenSendAmount = params.calculatedSendingAmount ?? 0

  const [pricing, setPricing] = useState(() => {
    const stashed = peekSendPayoutQuote()
    const useStashed =
      stashed &&
      (params.receiveAmountValue ?? 0) > 0 &&
      stashed.receiveAmount === (params.receiveAmountValue ?? 0)
    if (useStashed) {
      const easnerFeeAmt =
        stashed.easner.pricingTotals?.total_easner_fee ?? stashed.easner.totalFeeAmount ?? 0
      return {
        calculatedSendingAmount: amountScreenSendAmount,
        calculatedFeeAmount: easnerFeeAmt,
        calculatedTotalAmount: stashed.totalDebited,
        noahFee: stashed.noah.totalFee,
        easnerFee: easnerFeeAmt,
        pricingQuoteId: stashed.pricingQuoteId,
        pricingQuoteExpiry: stashed.expiresAt,
        pricingQuoteResult: stashed.easner,
        payoutSession: {
          formSessionId: stashed.noah.formSessionId,
          cryptoAuthorizedAmount: stashed.noah.cryptoAuthorizedAmount,
          cryptoCurrency: stashed.noah.cryptoCurrency,
          ...(stashed.channelId ? { channelId: stashed.channelId } : {}),
        },
        quoteLoading: false,
        quoteError: null as string | null,
      }
    }
    return {
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
    }
  })

  const {
    calculatedSendingAmount,
    calculatedFeeAmount,
    calculatedTotalAmount,
    easnerFee,
    pricingQuoteId,
    pricingQuoteExpiry,
    pricingQuoteResult,
    payoutSession,
    quoteLoading,
    quoteError,
  } = pricing

  const easetagUi = recipient ? resolveRecipientEasetagForUi(recipient) : ''
  const easenetDisplay = useEasenetRecipientHydration(recipient ?? null)
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
  const quoteCountdown = useQuoteCountdown(pricingQuoteExpiry)
  const quoteReady = Boolean(easetagUi || payoutSession?.formSessionId)
  const processingFee = easnerFee || calculatedFeeAmount
  const exchangeFee = useMemo(
    () =>
      computeBalancePayoutExchangeFee(
        calculatedTotalAmount,
        calculatedSendingAmount,
        processingFee,
      ),
    [calculatedTotalAmount, calculatedSendingAmount, processingFee],
  )

  const [sendingAfterPin, setSendingAfterPin] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

  useEffect(() => {
    analytics.trackScreenView('SendConfirm')
  }, [])

  /** Refresh quote only when not preloaded on amount screen. */
  useEffect(() => {
    if (!recipient || easetagUi) return
    if (!recipient.id || !(receiveAmountValue > 0)) return
    if (isStashedPayoutQuoteFresh(receiveAmountValue)) {
      clearSendPayoutQuote()
      return
    }
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
            const msg = e instanceof Error ? e.message : TRANSFER_FAIL_MESSAGE
            setTransferError(msg)
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
    setTransferError(null)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (!user?.id) {
      showError('Not authenticated.')
      return
    }
    if (!(await hasPin(user.id))) {
      showError('Set an app PIN in Settings before authorizing transfers.')
      return
    }
    if (quoteError && !easetagUi) {
      setTransferError(quoteError)
      return
    }
    if (!easetagUi && !payoutSession?.formSessionId) {
      setTransferError('Payout quote is still loading. Wait a moment or go back and try again.')
      return
    }
    if (!easetagUi && quoteCountdown.expired) {
      setTransferError('Quote expired. Go back and continue again for a fresh quote.')
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
              <Row
                label="You send"
                value={formatMoneyDisplay(calculatedSendingAmount, selectedBalanceCurrency)}
              />
              {selectedBalanceCurrency === 'USD' || selectedBalanceCurrency === 'EUR' ? (
                <FromBalanceRow currency={selectedBalanceCurrency} />
              ) : null}
              {!easetagUi && quoteReady ? (
                <>
                  <Row
                    label="Exchange fee"
                    value={formatMoneyDisplay(exchangeFee, selectedBalanceCurrency)}
                  />
                  <Row
                    label="Processing fee"
                    value={formatMoneyDisplay(processingFee, selectedBalanceCurrency)}
                  />
                </>
              ) : null}
              {!easetagUi && calculatedTotalAmount > 0 ? (
                <Row
                  label="Total debited"
                  value={formatMoneyDisplay(calculatedTotalAmount, selectedBalanceCurrency)}
                  bold
                />
              ) : null}
              <Row
                label="Recipient gets"
                value={formatMoneyDisplay(receiveAmountValue, receiveCurrency)}
              />
              {arrivalHint && !easetagUi ? (
                <Row label="Arrival" value={arrivalHint} />
              ) : null}
              {recipient ? (
                <View
                  style={[
                    styles.recipientRow,
                    !displayTransactionId && !pricingQuoteExpiry && styles.rowLast,
                  ]}
                >
                  <Text style={styles.rowLabel}>Recipient</Text>
                  <View style={styles.recipientSummaryWrap}>
                    <SendSelectedRecipientSummary
                      recipient={recipient}
                      easenetPreview={easenetDisplay}
                      alignEnd
                    />
                  </View>
                </View>
              ) : null}
              {displayTransactionId ? (
                <Row label="Transaction ID" value={displayTransactionId} last={!pricingQuoteExpiry} />
              ) : null}
              {quoteError ? (
                <Text style={styles.quoteError} accessibilityRole="alert">
                  {quoteError}
                </Text>
              ) : null}
              {transferError ? (
                <Text style={styles.transferError} accessibilityRole="alert">
                  {transferError}
                </Text>
              ) : null}
              {!easetagUi && pricingQuoteExpiry ? (
                <Text style={styles.quoteHint}>
                  {quoteCountdown.expired
                    ? 'Quote expired — go back and continue again for a fresh quote.'
                    : `Quote valid for ${quoteCountdown.label}`}
                </Text>
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

const TRANSFER_FAIL_MESSAGE = "We couldn't send this transfer, please try again."

function FromBalanceRow({ currency }: { currency: string }) {
  return (
    <View style={styles.fromRow}>
      <Text style={styles.rowLabel}>From</Text>
      <View style={styles.fromBalanceInline}>
        <View style={styles.fromFlagContainer}>
          <CurrencyFlag currency={currency} size={22} style={styles.fromFlagImage} />
        </View>
        <Text style={styles.fromBalanceText} numberOfLines={1}>
          {currency} Balance
        </Text>
      </View>
    </View>
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
  recipientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
    paddingBottom: spacing[3],
    marginBottom: spacing[3],
  },
  recipientSummaryWrap: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '72%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
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
  fromRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
    paddingBottom: spacing[3],
    marginBottom: spacing[3],
  },
  fromBalanceInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexShrink: 1,
    maxWidth: '72%',
    justifyContent: 'flex-end',
  },
  fromFlagContainer: {
    ...surfaceChromeCircleStyle(colors, 22, { shadow: 'none' }),
    overflow: 'hidden',
  },
  fromFlagImage: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  fromBalanceText: {
    flexShrink: 1,
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
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
    flexShrink: 1,
  },
  transferError: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    marginTop: spacing[2],
    flexShrink: 1,
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
