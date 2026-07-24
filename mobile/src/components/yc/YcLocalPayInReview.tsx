import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  buildYcLocalPayInReviewRows,
  getGlobalPayoutProcessingTime,
  REVIEW_ROW_LABELS,
  TLC_LOCAL_TRANSFER_METHOD,
  resolveYcCrossBorderLocalPayInBreakdownForDisplay,
  useYcCrossBorderPayInLock,
  useYcPayInAttest,
  YC_PAY_IN_REVIEW_AND_COMPLETE_TITLE,
  ycPayInCompleteCta,
  type YcLocalPayInReviewPhase,
} from '@easner/shared'
import type { Recipient } from '../../types'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { SendSelectedRecipientSummary } from '../send/SendSelectedRecipientSummary'
import {
  TransactionDetailSummaryRow,
  TransactionDetailCopyableValue,
} from '../transactions/TransactionDetailSummaryRow'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'
import { haptics } from '../../lib/haptics'
import { YcPayInPaymentBlock } from './YcPayInPaymentBlock'
import { YcPayInAwaitingPaymentCountdown } from './YcPayInAwaitingPaymentCountdown'
import { navigateToTransactionDetailAfterPayIn } from '../../navigation/transactionDetailNavigation'
import { attestYcPayInPayment } from '../../lib/ycPayInAttest'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import {
  ensureCrossBorderOrderConfirmed,
  isCompleteCrossBorderQuote,
  isStashedCrossBorderQuoteFresh,
  peekCrossBorderQuote,
  peekLastCrossBorderQuoteError,
  prefetchCrossBorderQuotePipeline,
  type CrossBorderQuoteStashMeta,
} from '../../lib/sendFlowCrossBorderQuote'
import type { YcCrossBorderQuoteResult, YcPayInRail } from '../../hooks/useYcCrossBorderFlow'

type Props = {
  navigation: { goBack: () => void; navigate: (name: string, params?: object) => void }
  recipient: Recipient
  receiveAmount: number
  receiveCurrency: string
  payInCurrency: string
  payInCountry: string
  payInRail: YcPayInRail
  sourcePhone?: string
  networkId?: string
  sourceNetworkName?: string
  clientCustomerRate?: number
  clientProvisionalLocalPayIn?: number
  clientProcessingFee?: number
  clientDisplayProcessingFeeLocal?: number
  clientYcLegFeesUsd?: number
  crossBorderProvider?: 'yellowcard' | 'grid'
  footerPadding: number
  listBottomPadding: number
}

export function YcLocalPayInReview({
  navigation,
  recipient,
  receiveAmount,
  receiveCurrency,
  payInCurrency,
  payInCountry,
  payInRail,
  sourcePhone,
  networkId,
  sourceNetworkName,
  clientCustomerRate = 0,
  clientProvisionalLocalPayIn = 0,
  clientProcessingFee,
  clientDisplayProcessingFeeLocal,
  clientYcLegFeesUsd,
  crossBorderProvider,
  footerPadding,
  listBottomPadding,
}: Props) {
  const isMobileMoney = payInRail === 'mobile_money'
  const momoConfigured = Boolean(sourcePhone?.trim() && networkId)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyToClipboard = useCopyToClipboard()

  const quoteMeta = useMemo((): CrossBorderQuoteStashMeta | null => {
    if (!payInCurrency || !payInCountry) return null
    if (isMobileMoney && !momoConfigured) return null
    return isMobileMoney
      ? {
          recipientId: recipient.id,
          payInCurrency,
          payInCountry,
          payInRail,
          receiveAmount,
          crossBorderProvider,
          sourcePhone: sourcePhone?.trim(),
          networkId,
          sourceNetworkName,
        }
      : {
          recipientId: recipient.id,
          payInCurrency,
          payInCountry,
          payInRail,
          receiveAmount,
          crossBorderProvider,
        }
  }, [
    recipient.id,
    receiveAmount,
    payInCurrency,
    payInCountry,
    payInRail,
    crossBorderProvider,
    isMobileMoney,
    momoConfigured,
    sourcePhone,
    networkId,
    sourceNetworkName,
  ])

  useEffect(() => {
    if (!quoteMeta) return
    prefetchCrossBorderQuotePipeline(quoteMeta)
  }, [quoteMeta])

  const lockKey = quoteMeta
    ? [
        quoteMeta.recipientId,
        quoteMeta.payInCurrency,
        quoteMeta.payInCountry,
        quoteMeta.payInRail,
        quoteMeta.receiveAmount,
        quoteMeta.sourcePhone ?? '',
        quoteMeta.networkId ?? '',
      ].join('|')
    : ''

  const { quote: lockedQuote, isLocked, isLoading, error: lockError } = useYcCrossBorderPayInLock<YcCrossBorderQuoteResult>({
    enabled: Boolean(quoteMeta && lockKey),
    lockKey,
    getCachedLocked: () => {
      if (!quoteMeta || !isStashedCrossBorderQuoteFresh(quoteMeta)) return null
      const cached = peekCrossBorderQuote()
      return cached && isCompleteCrossBorderQuote(cached) ? cached : null
    },
    isLocked: isCompleteCrossBorderQuote,
    confirmOrder: () => (quoteMeta ? ensureCrossBorderOrderConfirmed(quoteMeta) : Promise.resolve(null)),
    getErrorMessage: peekLastCrossBorderQuoteError,
  })

  const previewQuote =
    quoteMeta && isStashedCrossBorderQuoteFresh(quoteMeta) ? peekCrossBorderQuote() : null
  const stashedLocked =
    previewQuote && isCompleteCrossBorderQuote(previewQuote) ? previewQuote : null
  const activeLockedQuote = lockedQuote ?? stashedLocked
  const displayQuote = activeLockedQuote ?? previewQuote
  const displayLocked = isLocked || Boolean(stashedLocked)
  const reviewPhase: YcLocalPayInReviewPhase = displayLocked ? 'locked' : 'preview'
  const quoteCountdown = useQuoteCountdown(displayQuote?.expiresAt)
  const customerRate = displayQuote?.customerRate ?? clientCustomerRate
  const displayLocalPayIn =
    displayQuote?.localPayIn ??
    (clientProvisionalLocalPayIn > 0 ? clientProvisionalLocalPayIn : 0)
  const displayTransactionId =
    activeLockedQuote?.easnerTransactionId ??
    activeLockedQuote?.transactionId ??
    ''
  const processingTime = getGlobalPayoutProcessingTime(TLC_LOCAL_TRANSFER_METHOD)

  const reviewBreakdown = resolveYcCrossBorderLocalPayInBreakdownForDisplay({
    localPayIn: displayLocalPayIn,
    payInCurrency,
    receiveAmount,
    customerRate,
    provisionalPayIn: displayQuote?.provisionalPayIn ?? clientProvisionalLocalPayIn,
    displayProcessingFeeLocal:
      displayQuote?.displayProcessingFeeLocal ?? clientDisplayProcessingFeeLocal,
  })

  const reviewRows = buildYcLocalPayInReviewRows({
    mode: 'cross_border_send',
    phase: reviewPhase,
    rail: payInRail,
    payInCurrency,
    receiveCurrency,
    customerRate,
    localPayIn: displayLocalPayIn,
    receiveAmount,
    processingFeeLocal: reviewBreakdown.feeLocal,
    processingFeeUsd: displayQuote?.processingFee ?? clientProcessingFee,
    exchangeFeeUsd: displayQuote?.ycLegFeesUsd ?? clientYcLegFeesUsd,
    principalLocal: reviewBreakdown.principalLocal,
    transactionId: displayTransactionId || undefined,
    processingTime: displayLocked ? processingTime : undefined,
  })

  const { attestLoading, attestError, attestPayment } = useYcPayInAttest({
    attest: attestYcPayInPayment,
    onSuccess: (transactionId) => {
      navigateToTransactionDetailAfterPayIn(navigation, transactionId, 'SendFlow')
    },
  })

  const handleCopy = async (text: string, key: string) => {
    haptics.tap()
    await copyToClipboard(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const ctaDisabled =
    !displayLocked ||
    attestLoading ||
    quoteCountdown.expired ||
    Boolean(lockError) ||
    !activeLockedQuote?.transferId

  const onAttest = () => {
    if (!activeLockedQuote?.transferId || !displayTransactionId) return
    haptics.medium()
    void attestPayment(displayTransactionId, activeLockedQuote.transferId)
  }

  return (
    <View style={[styles.container, { paddingBottom: footerPadding }]}>
      <View style={styles.header}>
        <Pressable android_ripple={ripple.neutral} onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>{YC_PAY_IN_REVIEW_AND_COMPLETE_TITLE}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: listBottomPadding }} showsVerticalScrollIndicator={false}>
        {reviewRows.length > 0 ? (
          <View style={styles.card}>
            {reviewRows.map((row, index) => {
              if (row.id === 'transfer-method') {
                return (
                  <TransactionDetailSummaryRow
                    key={row.id}
                    label={row.label}
                    value={row.value}
                    last={index === reviewRows.length - 1}
                  />
                )
              }
              if (row.id === 'recipient-gets') {
                return (
                  <React.Fragment key={row.id}>
                    <TransactionDetailSummaryRow
                      label={row.label}
                      value={row.value}
                      valueBold={row.valueBold}
                    />
                    <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.recipient}>
                      <View style={styles.recipientSummaryWrap}>
                        <SendSelectedRecipientSummary recipient={recipient} alignEnd />
                      </View>
                    </TransactionDetailSummaryRow>
                  </React.Fragment>
                )
              }
              if (row.id === 'transaction-id') {
                return (
                  <TransactionDetailSummaryRow key={row.id} label={row.label}>
                    <TransactionDetailCopyableValue
                      value={row.value}
                      mono
                      copied={copiedKey === 'transaction-id'}
                      onPress={() => void handleCopy(displayTransactionId, 'transaction-id')}
                    />
                  </TransactionDetailSummaryRow>
                )
              }
              return (
                <TransactionDetailSummaryRow
                  key={row.id}
                  label={row.label}
                  value={row.value}
                  valueBold={row.valueBold}
                  valueMono={row.valueMono}
                />
              )
            })}
          </View>
        ) : null}

        {displayLocked && activeLockedQuote ? (
          <>
            {activeLockedQuote.expiresAt ? (
              <View style={styles.countdownWrap}>
                <YcPayInAwaitingPaymentCountdown
                  depositExpiresAt={activeLockedQuote.expiresAt}
                  context="review"
                />
              </View>
            ) : null}
            <YcPayInPaymentBlock
              payInRail={payInRail}
              localPayIn={displayLocalPayIn}
              localCurrency={payInCurrency}
              bankInfo={activeLockedQuote.bankInfo}
              sourcePhone={activeLockedQuote.sourcePhone ?? sourcePhone}
              sourceNetworkName={activeLockedQuote.sourceNetworkName ?? sourceNetworkName}
              transactionId={displayTransactionId}
              copiedKey={copiedKey}
              onCopy={handleCopy}
            />
          </>
        ) : null}

        {lockError ? <Text style={styles.error}>{lockError}</Text> : null}
        {attestError ? <Text style={styles.error}>{attestError}</Text> : null}
      </ScrollView>

      <Pressable
        android_ripple={ripple.neutral}
        style={[styles.cta, ctaDisabled && styles.ctaDisabled]}
        onPress={onAttest}
        disabled={ctaDisabled}
      >
        <LinearGradient
          colors={ctaDisabled ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaGradient}
        >
          {attestLoading ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <Text style={styles.ctaText}>{ycPayInCompleteCta(payInRail)}</Text>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing[5] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] },
  backButton: { padding: spacing[1] },
  title: { ...textStyles.screenTitle },
  card: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  recipientSummaryWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '72%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  countdownWrap: {
    marginBottom: spacing[2],
  },
  error: { ...textStyles.caption, color: colors.semantic.destructive, marginTop: spacing[2] },
  cta: { borderRadius: borderRadius.lg, overflow: 'hidden', marginTop: spacing[3] },
  ctaDisabled: { opacity: 0.7 },
  ctaGradient: { paddingVertical: spacing[4], alignItems: 'center' },
  ctaText: { ...textStyles.button, color: colors.text.inverse },
})
