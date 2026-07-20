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
} from '@easner/shared'
import type { Recipient } from '../../types'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { SendSelectedRecipientSummary } from '../send/SendSelectedRecipientSummary'
import { TransactionDetailSummaryRow } from '../transactions/TransactionDetailSummaryRow'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'
import { haptics } from '../../lib/haptics'
import {
  confirmCrossBorderLeg1,
  ensureCrossBorderLeg2Locked,
  fetchCrossBorderQuotePreview,
  isCompleteCrossBorderQuote,
  isCrossBorderLeg2Locked,
  isStashedCrossBorderQuoteFresh,
  isUsableCrossBorderQuotePreview,
  peekCrossBorderLeg2DraftId,
  peekCrossBorderQuote,
  peekLastCrossBorderQuoteError,
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
  footerPadding,
  listBottomPadding,
}: Props) {
  const isMobileMoney = payInRail === 'mobile_money'
  const momoConfigured = Boolean(sourcePhone?.trim() && networkId)

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
        }
  }, [
    recipient.id,
    receiveAmount,
    payInCurrency,
    payInCountry,
    payInRail,
    isMobileMoney,
    momoConfigured,
    sourcePhone,
    networkId,
    sourceNetworkName,
  ])

  const [previewQuote, setPreviewQuote] = useState<YcCrossBorderQuoteResult | null>(null)
  const [leg2Quote, setLeg2Quote] = useState<YcCrossBorderQuoteResult | null>(() => {
    if (!quoteMeta) return null
    if (isStashedCrossBorderQuoteFresh(quoteMeta)) {
      const stashed = peekCrossBorderQuote()
      if (stashed && isCrossBorderLeg2Locked(stashed, peekCrossBorderLeg2DraftId())) {
        return stashed
      }
    }
    return null
  })
  const [lockedQuote, setLockedQuote] = useState<YcCrossBorderQuoteResult | null>(() => {
    if (!quoteMeta) return null
    if (isStashedCrossBorderQuoteFresh(quoteMeta) && isCompleteCrossBorderQuote(peekCrossBorderQuote())) {
      return peekCrossBorderQuote()
    }
    return null
  })
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(() => {
    if (!quoteMeta) return false
    if (isStashedCrossBorderQuoteFresh(quoteMeta) && isCompleteCrossBorderQuote(peekCrossBorderQuote())) {
      return false
    }
    if (
      isStashedCrossBorderQuoteFresh(quoteMeta) &&
      isCrossBorderLeg2Locked(peekCrossBorderQuote(), peekCrossBorderLeg2DraftId())
    ) {
      return false
    }
    return true
  })
  const [confirmLoading, setConfirmLoading] = useState(false)

  useEffect(() => {
    if (!quoteMeta) return

    if (isStashedCrossBorderQuoteFresh(quoteMeta) && isCompleteCrossBorderQuote(peekCrossBorderQuote())) {
      const stashed = peekCrossBorderQuote()
      if (stashed) {
        setLockedQuote(stashed)
        setLeg2Quote(stashed)
        setPreviewQuote(stashed)
        setQuoteError(null)
      }
      setQuoteLoading(false)
      return
    }

    if (
      isStashedCrossBorderQuoteFresh(quoteMeta) &&
      isCrossBorderLeg2Locked(peekCrossBorderQuote(), peekCrossBorderLeg2DraftId())
    ) {
      const stashed = peekCrossBorderQuote()
      if (stashed) {
        setLeg2Quote(stashed)
        setPreviewQuote(stashed)
        setQuoteError(null)
      }
      setQuoteLoading(false)
      return
    }

    let cancelled = false
    setQuoteLoading(true)
    setQuoteError(null)
    void (async () => {
      const previewPromise = fetchCrossBorderQuotePreview(quoteMeta).catch(() => null)
      const leg2Promise = ensureCrossBorderLeg2Locked(quoteMeta)
      const preview = await previewPromise
      if (cancelled) return
      if (preview && isUsableCrossBorderQuotePreview(preview)) {
        setPreviewQuote(preview)
      }
      const leg2 = await leg2Promise
      if (cancelled) return
      setQuoteLoading(false)
      if (leg2 && (isCrossBorderLeg2Locked(leg2, leg2.leg2DraftId) || isCompleteCrossBorderQuote(leg2))) {
        setLeg2Quote(leg2)
        if (isCompleteCrossBorderQuote(leg2)) {
          setLockedQuote(leg2)
        }
        setQuoteError(null)
        return
      }
      setQuoteError(peekLastCrossBorderQuoteError() || 'Could not lock transfer details')
    })()

    return () => {
      cancelled = true
    }
  }, [quoteMeta])

  const displayQuote = lockedQuote ?? leg2Quote ?? previewQuote
  const quoteCountdown = useQuoteCountdown(displayQuote?.expiresAt)
  const quoteLocked = isCompleteCrossBorderQuote(lockedQuote)
  const leg2Ready = isCrossBorderLeg2Locked(leg2Quote, peekCrossBorderLeg2DraftId() ?? leg2Quote?.leg2DraftId)
  const customerRate = displayQuote?.customerRate ?? 0
  const displayLocalPayIn = displayQuote?.localPayIn ?? 0
  const displayTransactionId = lockedQuote?.easnerTransactionId ?? lockedQuote?.transactionId ?? ''
  const processingTime = getGlobalPayoutProcessingTime(TLC_LOCAL_TRANSFER_METHOD)

  const reviewBreakdown = resolveYcCrossBorderLocalPayInBreakdownForDisplay({
    localPayIn: displayLocalPayIn,
    payInCurrency,
    receiveAmount,
    customerRate,
    provisionalPayIn: displayQuote?.provisionalPayIn,
    displayProcessingFeeLocal: displayQuote?.displayProcessingFeeLocal,
  })
  const reviewPrincipalLocal = reviewBreakdown.principalLocal
  const reviewFeeLocal = reviewBreakdown.feeLocal

  const reviewRows = buildYcLocalPayInReviewRows({
    mode: 'cross_border_send',
    phase: quoteLocked ? 'locked' : 'preview',
    rail: payInRail,
    payInCurrency,
    receiveCurrency,
    customerRate,
    localPayIn: displayLocalPayIn,
    receiveAmount,
    processingFeeLocal: reviewFeeLocal,
    processingFeeUsd: displayQuote?.processingFee,
    exchangeFeeUsd: displayQuote?.ycLegFeesUsd,
    principalLocal: reviewPrincipalLocal,
    transactionId: displayTransactionId,
    processingTime,
  })

  const navigateToPayIn = (q: YcCrossBorderQuoteResult) => {
    const etid = q.easnerTransactionId ?? q.transactionId
    navigation.navigate('YcPayIn', {
      flowMode: 'cross_border_send',
      transactionId: etid,
      sendAmount: q.localPayIn,
      sendCurrency: payInCurrency,
      receiveAmount,
      receiveCurrency,
      recipientName: recipient.full_name || recipient.name || 'Recipient',
      transferId: q.transferId,
      localPayIn: q.localPayIn,
      customerRate: q.customerRate,
      provisionalPayIn: q.provisionalPayIn,
      bankInfo: q.bankInfo,
      payInNotice: q.payInNotice,
      payInRail,
      processingFeeLocal: q.displayProcessingFeeLocal,
      displayProcessingFee: q.displayProcessingFee,
      processingFee: q.processingFee,
      ycChannelFeeUsd: q.ycLegFeesUsd,
      sourcePhone: q.sourcePhone ?? sourcePhone?.trim(),
      sourceNetworkId: q.sourceNetworkId ?? networkId,
      sourceNetworkName: q.sourceNetworkName ?? sourceNetworkName,
    })
  }

  const onContinue = async () => {
    if (!quoteMeta || quoteLocked) {
      if (lockedQuote) {
        haptics.medium()
        navigateToPayIn(lockedQuote)
      }
      return
    }
    if (!leg2Ready) return
    const leg2DraftId = peekCrossBorderLeg2DraftId() ?? leg2Quote?.leg2DraftId
    if (!leg2DraftId) return

    setConfirmLoading(true)
    setQuoteError(null)
    try {
      const result = await confirmCrossBorderLeg1(quoteMeta, leg2DraftId)
      if (!isCompleteCrossBorderQuote(result)) {
        setQuoteError(peekLastCrossBorderQuoteError() || 'Could not lock transfer details')
        return
      }
      setLockedQuote(result)
      haptics.medium()
      navigateToPayIn(result)
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : 'Could not lock transfer details')
    } finally {
      setConfirmLoading(false)
    }
  }

  const ctaDisabled =
    confirmLoading ||
    !leg2Ready ||
    Boolean(quoteError) ||
    quoteCountdown.expired ||
    (quoteLoading && !leg2Ready)

  return (
    <View style={[styles.container, { paddingBottom: footerPadding }]}>
      <View style={styles.header}>
        <Pressable android_ripple={ripple.neutral} onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>Review transfer</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: listBottomPadding }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {quoteLoading && !leg2Ready ? (
            <ActivityIndicator color={colors.primary.main} style={{ marginVertical: spacing[4] }} />
          ) : null}
          {reviewRows.length > 0 ? (
            <>
              {reviewRows.map((row, index) => {
                if (row.id === 'transfer-method') {
                  return (
                    <TransactionDetailSummaryRow
                      key={row.id}
                      label={row.label}
                      value={row.value}
                      last={index === reviewRows.length - 1 && !displayQuote?.expiresAt}
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
            </>
          ) : null}

          {quoteError ? <Text style={styles.error}>{quoteError}</Text> : null}
          {displayQuote?.expiresAt ? (
            <Text style={styles.hint}>
              {quoteCountdown.expired
                ? 'Quote expired — go back and continue again.'
                : `Quote valid for ${quoteCountdown.label}`}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <Pressable
        android_ripple={ripple.neutral}
        style={[styles.cta, ctaDisabled && styles.ctaDisabled]}
        onPress={() => void onContinue()}
        disabled={ctaDisabled}
      >
        <LinearGradient
          colors={ctaDisabled ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaGradient}
        >
          {confirmLoading ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <Text style={styles.ctaText}>Continue</Text>
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
  },
  recipientSummaryWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '72%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  error: { ...textStyles.caption, color: colors.semantic.destructive, marginTop: spacing[2] },
  hint: { ...textStyles.caption, color: colors.text.secondary, marginTop: spacing[2] },
  cta: { borderRadius: borderRadius.lg, overflow: 'hidden', marginTop: spacing[3] },
  ctaDisabled: { opacity: 0.7 },
  ctaGradient: { paddingVertical: spacing[4], alignItems: 'center' },
  ctaText: { ...textStyles.button, color: colors.text.inverse },
})
