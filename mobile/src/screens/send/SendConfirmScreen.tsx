import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, ActivityIndicator } from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CommonActions, useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import {
  findPayoutFieldsSchema,
  formatMoneyDisplay,
  formatSendRateLabel,
  formatWalletSendTransferMethod,
  getGlobalPayoutTransferMethod,
  resolveSendConfirmArrivalHint,
  hasWalletSendFxDisplay,
  computeDisplayProcessingFee,
  normalizeTransferMethodLabel,
  shouldShowPayoutReviewFeeRow,
  qk,
  resolvePayoutCountryCode,
  resolveRecipientPayoutRail,
} from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useFixedFooterPadding, useScrollPaddingAboveFooter } from '../../hooks/useScrollBottomPadding'
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
import { prefetchTransactionDetail } from '../../hooks/queries'
import { executeBalanceSend } from '../../hooks/executeBalanceSend'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'
import { consumeBalanceSendPinVerified } from '../../lib/sendFlowPostPinGate'
import { hasPin } from '../../lib/pinAuth'
import { analytics } from '../../lib/analytics'
import type { PricingQuote } from '../../lib/noahService'
import { noahService } from '../../lib/noahService'
import type { PayoutPrepareSession } from '../../lib/payoutPrepareSession'
import { resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'
import { useEasenetRecipientHydration } from '../../hooks/useEasenetRecipientHydration'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { SendSelectedRecipientSummary } from '../../components/send/SendSelectedRecipientSummary'
import { getSendDestinationsMemory } from '../../lib/sendDestinations'
import { isWalletSendRecipient } from '../../lib/recipientWalletMeta'
import { isEasnerClientTransactionIdFormat } from '../../lib/transactionId'
import {
  isCompletePayoutQuote,
  isStashedPayoutQuoteFresh,
  peekSendPayoutQuote,
  clearSendPayoutQuote,
  payoutDisplayAmountsFromQuote,
  payoutPrepareSessionFromQuote,
} from '../../lib/sendFlowPayoutQuote'
import {
  isStashedWalletQuoteFresh,
  peekSendWalletQuote,
  clearSendWalletQuote,
  walletDisplayAmountsFromQuote,
  walletPrepareSessionFromQuote,
  type WalletPrepareSession,
} from '../../lib/sendFlowWalletQuote'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'
import { YcCrossBorderSendConfirm } from '../../components/send/YcCrossBorderSendConfirm'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { haptics } from '../../lib/haptics'

function payoutSessionMatchesRecipient(
  session: PayoutPrepareSession | undefined,
  recipientId: string | undefined,
): boolean {
  return Boolean(
    session?.formSessionId &&
      recipientId &&
      session.recipientId.trim() === recipientId.trim(),
  )
}

function walletSessionMatchesRecipient(
  session: WalletPrepareSession | undefined,
  recipientId: string | undefined,
): boolean {
  return Boolean(
    session?.formSessionId &&
      recipientId &&
      session.recipientId.trim() === recipientId.trim(),
  )
}

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
  const footerPadding = useFixedFooterPadding(spacing[4])
  const listBottomPadding = useScrollPaddingAboveFooter()
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
    amountEntryMode?: 'send' | 'receive'
    amountScreenSendAmount?: number
    isWalletSend?: boolean
    paymentMethod?: 'balance' | 'otherCurrency'
    ycPayInCurrency?: string
    ycPayInRail?: YcPayInRail
  }

  const isYcCrossBorder =
    params.paymentMethod === 'otherCurrency' &&
    Boolean(params.ycPayInCurrency) &&
    Boolean(params.ycPayInRail)

  const recipient = params.recipient
  const isWalletRecipient =
    Boolean(params.isWalletSend) || isWalletSendRecipient(recipient ?? null)
  const receiveAmountValue = params.receiveAmountValue ?? 0
  const selectedBalanceCurrency = params.selectedBalanceCurrency ?? 'USD'
  const receiveCurrency = params.receiveCurrency ?? recipient?.currency ?? ''
  const paramTransactionId = typeof params.transactionId === 'string' ? params.transactionId.trim() : ''
  const sendNote = typeof params.note === 'string' ? params.note.trim() : ''
  const sendPaymentPurpose = typeof params.paymentPurpose === 'string' ? params.paymentPurpose.trim() : ''

  const amountScreenSendAmount = params.amountScreenSendAmount ?? params.calculatedSendingAmount ?? 0
  const amountEntryMode = params.amountEntryMode ?? 'receive'
  const quoteStashMeta = useMemo(
    () => ({
      recipientId: recipient?.id ?? '',
      amountEntryMode,
      entryAmount: amountEntryMode === 'send' ? amountScreenSendAmount : receiveAmountValue,
      receiveCurrency,
    }),
    [recipient?.id, amountEntryMode, amountScreenSendAmount, receiveAmountValue, receiveCurrency],
  )

  const [quotedReceiveAmount, setQuotedReceiveAmount] = useState(() => {
    const stashed = peekSendPayoutQuote()
    const meta = {
      recipientId: params.recipient?.id ?? '',
      amountEntryMode: params.amountEntryMode ?? 'receive',
      entryAmount:
        (params.amountEntryMode ?? 'receive') === 'send'
          ? (params.amountScreenSendAmount ?? params.calculatedSendingAmount ?? 0)
          : (params.receiveAmountValue ?? 0),
      receiveCurrency: params.receiveCurrency ?? params.recipient?.currency ?? '',
    }
    if (stashed && isStashedPayoutQuoteFresh(meta)) return stashed.receiveAmount
    return params.receiveAmountValue ?? 0
  })

  const [pricing, setPricing] = useState(() => {
    const walletStashed = peekSendWalletQuote()
    const walletMeta = {
      recipientId: params.recipient?.id ?? '',
      amountEntryMode: params.amountEntryMode ?? 'receive',
      entryAmount:
        (params.amountEntryMode ?? 'receive') === 'send'
          ? (params.amountScreenSendAmount ?? params.calculatedSendingAmount ?? 0)
          : (params.receiveAmountValue ?? 0),
      receiveCurrency: params.receiveCurrency ?? params.recipient?.currency ?? '',
    }
    if (isWalletRecipient && walletStashed && isStashedWalletQuoteFresh(walletMeta)) {
      const display = walletDisplayAmountsFromQuote(walletStashed)
      return {
        calculatedSendingAmount: display.youSendAmount,
        calculatedFeeAmount: display.marginAmount,
        calculatedTotalAmount: display.totalDebited,
        noahFee: 0,
        easnerFee: display.marginAmount,
        pricingQuoteId: walletStashed.pricingQuoteId,
        pricingQuoteExpiry: walletStashed.expiresAt,
        pricingQuoteResult: null as PricingQuote | null,
        payoutSession: undefined as PayoutPrepareSession | undefined,
        walletSession: walletPrepareSessionFromQuote(walletStashed, params.recipient?.id ?? ''),
        quoteDisplay: display,
        quoteLoading: false,
        quoteError: null as string | null,
      }
    }
    const stashed = peekSendPayoutQuote()
    const meta = {
      recipientId: params.recipient?.id ?? '',
      amountEntryMode: params.amountEntryMode ?? 'receive',
      entryAmount:
        (params.amountEntryMode ?? 'receive') === 'send'
          ? (params.amountScreenSendAmount ?? params.calculatedSendingAmount ?? 0)
          : (params.receiveAmountValue ?? 0),
      receiveCurrency: params.receiveCurrency ?? params.recipient?.currency ?? '',
    }
    const useStashed = stashed && isStashedPayoutQuoteFresh(meta) && isCompletePayoutQuote(stashed)
    if (useStashed) {
      const display = payoutDisplayAmountsFromQuote(stashed)
      const easnerFeeAmt = display.marginAmount
      const payoutSessionFromQuote = payoutPrepareSessionFromQuote(stashed, params.recipient?.id ?? '')
      return {
        calculatedSendingAmount: display.youSendAmount,
        calculatedFeeAmount: easnerFeeAmt,
        calculatedTotalAmount: display.totalDebited,
        noahFee: stashed.noah.totalFee ?? 0,
        easnerFee: easnerFeeAmt,
        pricingQuoteId: stashed.pricingQuoteId,
        pricingQuoteExpiry: stashed.expiresAt,
        pricingQuoteResult: stashed.easner,
        payoutSession: payoutSessionFromQuote,
        walletSession: undefined as WalletPrepareSession | undefined,
        quoteDisplay: display,
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
      walletSession: undefined as WalletPrepareSession | undefined,
      quoteDisplay: null as ReturnType<typeof payoutDisplayAmountsFromQuote> | null,
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
    walletSession,
    quoteDisplay,
    quoteLoading,
    quoteError,
  } = pricing

  const easetagUi = recipient ? resolveRecipientEasetagForUi(recipient) : ''
  const easenetDisplay = useEasenetRecipientHydration(recipient ?? null)
  const sendDestinations = getSendDestinationsMemory()
  const payoutRail =
    recipient != null
      ? resolveRecipientPayoutRail({
          bank_name: recipient.bank_name,
          mobile_provider: recipient.mobile_provider,
        })
      : 'bank_transfer'
  const payoutCountryCode = recipient
    ? resolvePayoutCountryCode({
        countryCode: recipient.country_code,
        currencyCode: recipient.currency,
      })
    : ''
  const payoutHints =
    sendDestinations && recipient && payoutCountryCode
      ? findPayoutFieldsSchema(
          payoutRail === 'mobile_money'
            ? sendDestinations.fiat.mobile_money
            : sendDestinations.fiat.bank_transfer,
          {
            countryCode: payoutCountryCode,
            currencyCode: recipient.currency,
            rail: payoutRail,
          },
        )
      : null
  const arrivalHint = resolveSendConfirmArrivalHint({
    isEasetag: Boolean(easetagUi),
    isWalletSend: isWalletRecipient,
    processingSeconds: payoutHints?.processing_seconds,
    countryCode: payoutCountryCode,
    currencyCode: recipient?.currency,
    rail: payoutRail,
  })
  const sendReservedDebitEtid =
    paramTransactionId && isEasnerClientTransactionIdFormat(paramTransactionId)
      ? paramTransactionId.toUpperCase()
      : undefined

  const displayTransactionId = paramTransactionId ? paramTransactionId.toUpperCase() : null
  const quoteCountdown = useQuoteCountdown(pricingQuoteExpiry)
  const quoteReady = Boolean(
    easetagUi ||
      (isWalletRecipient
        ? walletSessionMatchesRecipient(walletSession, recipient?.id)
        : payoutSessionMatchesRecipient(payoutSession, recipient?.id)),
  )
  const walletNetwork =
    recipient?.wallet_network?.trim() ||
    peekSendWalletQuote()?.receiveNetwork?.trim() ||
    ''
  const hasFx =
    !easetagUi &&
    (isWalletRecipient
      ? hasWalletSendFxDisplay(selectedBalanceCurrency, receiveCurrency, walletNetwork)
      : selectedBalanceCurrency.toUpperCase() !== receiveCurrency.toUpperCase())
  const customerRate = useMemo(() => {
    if (quoteDisplay?.customerRate && quoteDisplay.customerRate > 0) {
      return quoteDisplay.customerRate
    }
    const stashed = peekSendPayoutQuote()
    const rate = stashed?.noah?.rate ?? pricingQuoteResult?.providerRate ?? 0
    return Number.isFinite(rate) && rate > 0 ? rate : 0
  }, [quoteDisplay?.customerRate, pricingQuoteResult?.providerRate])
  const youSendAmount = quoteDisplay?.youSendAmount ?? calculatedSendingAmount
  const processingFee = quoteDisplay?.marginAmount ?? easnerFee ?? calculatedFeeAmount
  const exchangeFee = quoteDisplay?.exchangeFee ?? 0
  const networkFee = isWalletRecipient ? (quoteDisplay as { networkFee?: number } | null)?.networkFee ?? 0 : 0
  const displayProcessingFee = computeDisplayProcessingFee({
    processingFee,
    exchangeFee,
  })
  const walletExecutionModel =
    (quoteDisplay as { executionModel?: string } | null)?.executionModel ??
    walletSession?.executionModel ??
    peekSendWalletQuote()?.executionModel
  const showProcessingFee = shouldShowPayoutReviewFeeRow({ processingFee, exchangeFee })
  const transferMethod = recipient
    ? isWalletRecipient
      ? formatWalletSendTransferMethod(receiveCurrency, walletNetwork)
      : getGlobalPayoutTransferMethod({
          currency: receiveCurrency,
          countryCode: recipient.country_code,
          bankName: recipient.bank_name,
          mobileProvider: recipient.mobile_provider,
          payeeEasetag: recipient.payee_easetag,
        })
    : 'Local transfer'
  const processingTime = arrivalHint ?? undefined

  const [sendingAfterPin, setSendingAfterPin] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

  useEffect(() => {
    analytics.trackScreenView('SendConfirm')
  }, [])

  /** Refresh quote only when not preloaded on amount screen. */
  useEffect(() => {
    if (!recipient || easetagUi) return
    if (!recipient.id || !(receiveAmountValue > 0)) return
    if (isWalletRecipient) {
      if (walletSessionMatchesRecipient(walletSession, recipient.id)) return
      if (isStashedWalletQuoteFresh(quoteStashMeta)) {
        const stashed = peekSendWalletQuote()
        if (stashed) {
          setQuotedReceiveAmount(stashed.receiveAmount)
          const display = walletDisplayAmountsFromQuote(stashed)
          setPricing((prev) => ({
            ...prev,
            calculatedSendingAmount: display.youSendAmount,
            calculatedFeeAmount: display.marginAmount,
            calculatedTotalAmount: display.totalDebited,
            easnerFee: display.marginAmount,
            pricingQuoteId: stashed.pricingQuoteId,
            pricingQuoteExpiry: stashed.expiresAt,
            walletSession: walletPrepareSessionFromQuote(stashed, recipient.id),
            quoteDisplay: display,
            quoteLoading: false,
            quoteError: null,
          }))
        }
        return
      }
      let cancelled = false
      setPricing((prev) => ({ ...prev, quoteLoading: true, quoteError: null }))
      void (async () => {
        try {
          const wq = await noahService.createWalletSendQuote({
            recipientId: recipient.id,
            sourceBalanceCurrency: selectedBalanceCurrency,
            amountEntryMode,
            ...(amountEntryMode === 'receive' ? { receiveAmount: receiveAmountValue } : {}),
            ...(amountEntryMode === 'send' && amountScreenSendAmount > 0
              ? { sendAmount: amountScreenSendAmount }
              : {}),
          })
          if (cancelled) return
          setQuotedReceiveAmount(wq.receiveAmount)
          const display = walletDisplayAmountsFromQuote(wq)
          setPricing((prev) => ({
            ...prev,
            calculatedSendingAmount: display.youSendAmount,
            calculatedFeeAmount: display.marginAmount,
            calculatedTotalAmount: display.totalDebited,
            easnerFee: display.marginAmount,
            pricingQuoteId: wq.pricingQuoteId,
            pricingQuoteExpiry: wq.expiresAt,
            walletSession: walletPrepareSessionFromQuote(wq, recipient.id),
            quoteDisplay: display,
            quoteLoading: false,
            quoteError: null,
          }))
        } catch (e) {
          if (cancelled) return
          const msg = e instanceof Error ? e.message : 'Could not load wallet send quote'
          setPricing((prev) => ({ ...prev, quoteLoading: false, quoteError: msg }))
        }
      })()
      return () => {
        cancelled = true
      }
    }
    if (payoutSessionMatchesRecipient(payoutSession, recipient.id)) return
    if (isStashedPayoutQuoteFresh(quoteStashMeta)) {
      const stashed = peekSendPayoutQuote()
      if (stashed && isCompletePayoutQuote(stashed)) {
        setQuotedReceiveAmount(stashed.receiveAmount)
        const display = payoutDisplayAmountsFromQuote(stashed)
        const payoutSessionFromQuote = payoutPrepareSessionFromQuote(stashed, recipient.id)
        setPricing((prev) => ({
          ...prev,
          calculatedSendingAmount: display.youSendAmount,
          calculatedFeeAmount: display.marginAmount,
          calculatedTotalAmount: display.totalDebited,
          noahFee: stashed.noah.totalFee ?? 0,
          easnerFee: display.marginAmount,
          pricingQuoteId: stashed.pricingQuoteId,
          pricingQuoteExpiry: stashed.expiresAt,
          pricingQuoteResult: stashed.easner,
          payoutSession: payoutSessionFromQuote,
          quoteDisplay: display,
          quoteLoading: false,
          quoteError: null,
        }))
      }
      return
    }
    let cancelled = false
    setPricing((prev) => ({ ...prev, quoteError: null }))
    void (async () => {
      try {
        const pq = await noahService.createPayoutQuote({
          recipientId: recipient.id,
          receiveAmount: receiveAmountValue,
          sourceBalanceCurrency: selectedBalanceCurrency,
          amountEntryMode,
          ...(amountEntryMode === 'send' && amountScreenSendAmount > 0
            ? { sendAmount: amountScreenSendAmount }
            : {}),
          ...(sendNote ? { note: sendNote } : {}),
          ...(sendPaymentPurpose ? { paymentPurpose: sendPaymentPurpose } : {}),
        })
        if (cancelled) return
        if (!isCompletePayoutQuote(pq)) {
          setPricing((prev) => ({
            ...prev,
            quoteLoading: false,
            quoteError: 'Incomplete payout quote response.',
          }))
          return
        }
        setQuotedReceiveAmount(pq.receiveAmount)
        const display = payoutDisplayAmountsFromQuote(pq)
        const payoutSessionFromQuote = payoutPrepareSessionFromQuote(pq, recipient.id)
        setPricing((prev) => ({
          ...prev,
          calculatedSendingAmount: display.youSendAmount,
          noahFee: pq.noah.totalFee ?? 0,
          easnerFee: display.marginAmount,
          calculatedFeeAmount: display.marginAmount,
          calculatedTotalAmount: display.totalDebited,
          pricingQuoteId: pq.pricingQuoteId,
          pricingQuoteExpiry: pq.expiresAt,
          pricingQuoteResult: pq.easner,
          payoutSession: payoutSessionFromQuote,
          quoteDisplay: display,
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
  }, [easetagUi, isWalletRecipient, recipient?.id, recipient?.currency, selectedBalanceCurrency, receiveAmountValue, quoteStashMeta, amountScreenSendAmount, sendNote, sendPaymentPurpose, walletSession?.formSessionId, payoutSession?.formSessionId, amountEntryMode])

  useFocusEffect(
    useCallback(() => {
      if (!consumeBalanceSendPinVerified()) return
      if (!recipient || !user?.id) return

      let cancelled = false

      void (async () => {
        setSendingAfterPin(true)
        try {
          const reviewSnapshot =
            !easetagUi && calculatedTotalAmount > 0 && quotedReceiveAmount > 0
              ? {
                  you_send_amount: youSendAmount,
                  total_debited: calculatedTotalAmount,
                  exchange_fee: exchangeFee,
                  processing_fee: processingFee,
                  ...(isWalletRecipient && networkFee > 0 ? { network_fee: networkFee } : {}),
                  exchange_rate: hasFx && customerRate > 0 ? customerRate : 1,
                  send_currency: selectedBalanceCurrency,
                  receive_amount: quotedReceiveAmount,
                  receive_currency: receiveCurrency,
                  transfer_method: transferMethod,
                  ...(processingTime ? { processing_time: processingTime } : {}),
                  ...(processingFee > 0 ? { easner_fee: processingFee } : {}),
                  ...(isWalletRecipient && walletExecutionModel
                    ? { execution_model: walletExecutionModel }
                    : {}),
                  ...(exchangeFee > 0 ? { channel_cost: exchangeFee } : {}),
                  ...(payoutSession?.noahFloor ? { noah_floor: Number(payoutSession.noahFloor) } : {}),
                  ...(payoutSession?.noahSendAmount
                    ? { noah_send_amount: Number(payoutSession.noahSendAmount) }
                    : {}),
                }
              : undefined

          const { detailId } = await executeBalanceSend(
            {
              recipient,
              calculatedTotalAmount,
              receiveAmountValue: quotedReceiveAmount,
              selectedBalanceCurrency,
              ...(payoutSession ? { payoutSession } : {}),
              ...(walletSession ? { walletSession } : {}),
              ...(reviewSnapshot ? { reviewSnapshot } : {}),
              ...(sendReservedDebitEtid ? { reservedDebitEtid: sendReservedDebitEtid } : {}),
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
            void prefetchTransactionDetail(qc, scope, txId).catch(() => {})
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

          clearSendPayoutQuote()
          clearSendWalletQuote()
          haptics.success()
        } catch (e: unknown) {
          if (!cancelled) {
            haptics.error()
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
      quotedReceiveAmount,
      youSendAmount,
      exchangeFee,
      processingFee,
      hasFx,
      customerRate,
      transferMethod,
      processingTime,
      easetagUi,
      recipient,
      sendReservedDebitEtid,
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
    haptics.medium()
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
    if (
      !easetagUi &&
      !(isWalletRecipient
        ? walletSessionMatchesRecipient(walletSession, recipient.id)
        : payoutSessionMatchesRecipient(payoutSession, recipient.id))
    ) {
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
        <View style={[styles.container, { paddingBottom: footerPadding }]}>
          <Text style={textStyles.body}>Nothing to confirm.</Text>
          <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing[4] }}>
            <Text style={{ color: colors.primary.main }}>Go back</Text>
          </Pressable>
        </View>
      </ScreenWrapper>
    )
  }

  if (isYcCrossBorder) {
    return (
      <ScreenWrapper>
        <YcCrossBorderSendConfirm
          navigation={navigation}
          recipient={recipient}
          receiveAmount={params.receiveAmountValue ?? 0}
          receiveCurrency={params.receiveCurrency ?? recipient.currency ?? ''}
          payInCurrency={params.ycPayInCurrency!}
          payInRail={params.ycPayInRail!}
          transactionId={paramTransactionId || ''}
          footerPadding={footerPadding}
          listBottomPadding={listBottomPadding}
        />
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <View style={[styles.container, { paddingBottom: footerPadding }]}>
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
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: listBottomPadding }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              {displayTransactionId ? (
                <Row label="Transaction ID" value={displayTransactionId} />
              ) : null}
              <Row
                label="Sending"
                value={formatMoneyDisplay(youSendAmount, selectedBalanceCurrency)}
              />
              {selectedBalanceCurrency === 'USD' || selectedBalanceCurrency === 'EUR' ? (
                <FromBalanceRow currency={selectedBalanceCurrency} />
              ) : null}
              {!easetagUi && quoteReady && showProcessingFee ? (
                <Row
                  label="Processing fee"
                  value={formatMoneyDisplay(displayProcessingFee, selectedBalanceCurrency)}
                />
              ) : null}
              {hasFx && customerRate > 0 ? (
                <Row
                  label="Exchange rate"
                  value={formatSendRateLabel(
                    selectedBalanceCurrency,
                    receiveCurrency,
                    customerRate,
                  )}
                />
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
                value={formatMoneyDisplay(quotedReceiveAmount, receiveCurrency)}
              />
              {recipient ? (
                <View style={styles.recipientRow}>
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
              {!easetagUi ? (
                <Row
                  label="Transfer method"
                  value={normalizeTransferMethodLabel(transferMethod)}
                />
              ) : null}
              {arrivalHint ? (
                <Row label="Arrival" value={arrivalHint} last={!pricingQuoteExpiry} />
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
          style={[styles.cta, (sendingAfterPin || (!easetagUi && !quoteReady)) && styles.ctaDisabled]}
          onPress={() => void onConfirmPress()}
          disabled={sendingAfterPin || (!easetagUi && !quoteReady)}
        >
          <LinearGradient
            colors={
              sendingAfterPin || (!easetagUi && !quoteReady)
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
  scrollContent: {},
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
