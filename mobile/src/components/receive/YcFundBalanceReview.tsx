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
  computeYcFundBalancePrincipalLocalPayIn,
  resolveYcFundBalanceLocalPayInBreakdownForDisplay,
  REVIEW_ROW_LABELS,
} from '@easner/shared'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import type { YcFundBalanceQuoteResult } from '../../hooks/useYcFundBalanceFlow'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'
import { haptics } from '../../lib/haptics'
import { CreditDestinationRow } from '../transactions/CreditDestinationRow'
import { TransactionDetailSummaryRow } from '../transactions/TransactionDetailSummaryRow'
import {
  ensureFundBalanceOrderConfirmed,
  ensureFundBalanceQuoteStashed,
  isCompleteFundBalanceQuote,
  isStashedFundBalanceQuoteFresh,
  isUsableFundBalanceQuotePreview,
  peekFundBalanceQuote,
  peekLastFundBalanceQuoteError,
  type YcFundBalanceQuote,
} from '../../lib/sendFlowFundBalanceQuote'

type Props = {
  navigation: { goBack: () => void; navigate: (name: string, params?: object) => void }
  localPayInCurrency: string
  residenceCountry: string
  payInRail: YcPayInRail
  amountEntryMode: 'usd' | 'local'
  enteredAmount: number
  usdCredit: number
  localPayIn: number
  customerRate: number
  sourcePhone?: string
  networkId?: string
  sourceNetworkName?: string
  footerPadding: number
  listBottomPadding: number
}

export function YcFundBalanceReview({
  navigation,
  localPayInCurrency,
  residenceCountry,
  payInRail,
  amountEntryMode,
  enteredAmount,
  usdCredit,
  localPayIn,
  customerRate: previewCustomerRate,
  sourcePhone,
  networkId,
  sourceNetworkName,
  footerPadding,
  listBottomPadding,
}: Props) {
  const isMobileMoney = payInRail === 'mobile_money'

  const quoteMeta = useMemo(
    () => ({
      country: residenceCountry,
      currency: localPayInCurrency,
      rail: payInRail,
      amountEntryMode,
      enteredAmount,
      sourcePhone: isMobileMoney ? sourcePhone?.trim() : undefined,
      networkId: isMobileMoney ? networkId : undefined,
      sourceNetworkName: isMobileMoney ? sourceNetworkName : undefined,
    }),
    [
      residenceCountry,
      localPayInCurrency,
      payInRail,
      amountEntryMode,
      enteredAmount,
      isMobileMoney,
      sourcePhone,
      networkId,
      sourceNetworkName,
    ],
  )

  const [previewQuote, setPreviewQuote] = useState<YcFundBalanceQuoteResult | null>(() => {
    if (!isStashedFundBalanceQuoteFresh(quoteMeta)) return null
    const stashed = peekFundBalanceQuote()
    if (!stashed || isCompleteFundBalanceQuote(stashed)) return null
    return isUsableFundBalanceQuotePreview(stashed) ? stashed : null
  })
  const [lockedQuote, setLockedQuote] = useState<YcFundBalanceQuoteResult | null>(() => {
    if (isStashedFundBalanceQuoteFresh(quoteMeta) && isCompleteFundBalanceQuote(peekFundBalanceQuote())) {
      return peekFundBalanceQuote()
    }
    return null
  })
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const hasClientPreview =
    previewCustomerRate > 0 && localPayIn > 0 && usdCredit > 0

  useEffect(() => {
    if (isStashedFundBalanceQuoteFresh(quoteMeta) && isCompleteFundBalanceQuote(peekFundBalanceQuote())) {
      const stashed = peekFundBalanceQuote()
      if (stashed) {
        setLockedQuote(stashed)
        setPreviewQuote(stashed)
        setQuoteError(null)
      }
      return
    }

    let cancelled = false
    void ensureFundBalanceQuoteStashed(quoteMeta).then((preview) => {
      if (cancelled) return
      if (preview && isUsableFundBalanceQuotePreview(preview)) {
        setPreviewQuote(preview)
        setQuoteError(null)
        return
      }
      if (!hasClientPreview) {
        setQuoteError(peekLastFundBalanceQuoteError() || 'Could not load deposit details')
      }
    })

    return () => {
      cancelled = true
    }
  }, [quoteMeta, hasClientPreview])

  const displayQuote = lockedQuote ?? previewQuote
  const quoteCountdown = useQuoteCountdown(displayQuote?.expiresAt)
  const quoteLocked = isCompleteFundBalanceQuote(lockedQuote)
  const customerRate = displayQuote?.customerRate ?? previewCustomerRate
  const displayTransactionId = lockedQuote?.easnerTransactionId ?? lockedQuote?.transactionId ?? ''
  const resolvedLocalPayIn = displayQuote?.localPayIn ?? localPayIn
  const resolvedUsdCredit = displayQuote?.usdCredit ?? usdCredit

  const lockedReviewBreakdown =
    quoteLocked && resolvedLocalPayIn > 0
      ? resolveYcFundBalanceLocalPayInBreakdownForDisplay({
          localPayIn: resolvedLocalPayIn,
          localCurrency: localPayInCurrency,
          usdCredit: resolvedUsdCredit,
          exchangeRate: customerRate,
          displayProcessingFeeLocal: lockedQuote?.displayProcessingFeeLocal,
          processingFee: lockedQuote?.processingFee,
          exchangeFee: lockedQuote?.ycChannelFeeUsd ?? lockedQuote?.ycLegFeesUsd,
        })
      : null
  const reviewPrincipalLocal =
    lockedReviewBreakdown?.principalLocal ??
    computeYcFundBalancePrincipalLocalPayIn({
      usdCredit: resolvedUsdCredit,
      exchangeRate: customerRate,
    })
  const reviewFeeLocal = lockedReviewBreakdown?.feeLocal ?? 0

  const previewReviewBreakdown =
    !quoteLocked && previewCustomerRate > 0 && localPayIn > 0
      ? resolveYcFundBalanceLocalPayInBreakdownForDisplay({
          localPayIn,
          localCurrency: localPayInCurrency,
          usdCredit,
          exchangeRate: previewCustomerRate,
        })
      : null
  const previewPrincipalLocal =
    previewReviewBreakdown?.principalLocal ??
    computeYcFundBalancePrincipalLocalPayIn({
      usdCredit,
      exchangeRate: previewCustomerRate,
    })
  const previewFeeLocal = previewReviewBreakdown?.feeLocal ?? 0

  const reviewRows = quoteLocked
    ? buildYcLocalPayInReviewRows({
        mode: 'fund_balance',
        phase: 'locked',
        rail: payInRail,
        payInCurrency: localPayInCurrency,
        receiveCurrency: 'USD',
        customerRate,
        localPayIn: resolvedLocalPayIn,
        receiveAmount: resolvedUsdCredit,
        processingFeeLocal: reviewFeeLocal,
        processingFeeUsd: lockedQuote?.processingFee,
        exchangeFeeUsd: lockedQuote?.ycChannelFeeUsd ?? lockedQuote?.ycLegFeesUsd,
        principalLocal: reviewPrincipalLocal,
        usdCredit: resolvedUsdCredit,
        transactionId: displayTransactionId,
      })
    : previewCustomerRate > 0 && localPayIn > 0
      ? buildYcLocalPayInReviewRows({
          mode: 'fund_balance',
          phase: 'preview',
          rail: payInRail,
          payInCurrency: localPayInCurrency,
          receiveCurrency: 'USD',
          customerRate: previewCustomerRate,
          localPayIn,
          receiveAmount: usdCredit,
          processingFeeLocal: previewFeeLocal,
          principalLocal: previewPrincipalLocal,
          usdCredit,
        })
      : []

  const navigateToPayIn = (q: YcFundBalanceQuote) => {
    const baseParams = {
      flowMode: 'fund_balance' as const,
      transactionId: q.easnerTransactionId ?? q.transactionId,
      sendCurrency: localPayInCurrency,
      transferId: q.transferId,
      localPayIn: q.localPayIn,
      bankInfo: q.bankInfo ?? null,
      payInNotice: q.payInNotice,
      payInRail,
      sourcePhone: q.sourcePhone ?? sourcePhone?.trim(),
      sourceNetworkId: q.sourceNetworkId ?? networkId,
      sourceNetworkName: q.sourceNetworkName ?? sourceNetworkName,
      depositExpiresAt: q.expiresAt,
    }
    if (isMobileMoney) {
      navigation.navigate('YcPayIn', {
        ...baseParams,
        receiveAmount: q.usdCredit,
        receiveCurrency: 'USD',
        recipientName: 'your USD balance',
        customerRate: q.customerRate,
        processingFeeLocal: q.displayProcessingFeeLocal,
        displayProcessingFee: q.displayProcessingFee,
      })
      return
    }
    navigation.navigate('YcPayIn', {
      ...baseParams,
      receiveAmount: q.usdCredit,
      receiveCurrency: 'USD',
    })
  }

  const onContinue = async () => {
    if (quoteLocked && lockedQuote) {
      haptics.medium()
      navigateToPayIn(lockedQuote)
      return
    }
    if (!previewQuote) return

    setConfirmLoading(true)
    setQuoteError(null)
    try {
      const result = await ensureFundBalanceOrderConfirmed(quoteMeta)
      if (!isCompleteFundBalanceQuote(result)) {
        setQuoteError(peekLastFundBalanceQuoteError() || 'Could not lock deposit details')
        return
      }
      setLockedQuote(result)
      haptics.medium()
      navigateToPayIn(result)
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : 'Could not lock deposit details')
    } finally {
      setConfirmLoading(false)
    }
  }

  const ctaDisabled =
    confirmLoading ||
    quoteCountdown.expired ||
    Boolean(quoteError) ||
    (!quoteLocked && !previewQuote && !hasClientPreview)

  return (
    <View style={[styles.container, { paddingBottom: footerPadding }]}>
      <View style={styles.header}>
        <Pressable android_ripple={ripple.neutral} onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>Review deposit</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: listBottomPadding }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {reviewRows.length > 0 ? (
            <>
              {reviewRows.map((row, index) => {
                if (row.id === 'amount-to-credit') {
                  return (
                    <React.Fragment key={row.id}>
                      <TransactionDetailSummaryRow
                        label={row.label}
                        value={row.value}
                        valueBold={row.valueBold}
                      />
                      {quoteLocked ? (
                        <CreditDestinationRow
                          label={REVIEW_ROW_LABELS.creditTo}
                          currency="USD"
                          balanceLabel="USD Balance"
                        />
                      ) : null}
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
                    last={row.id === 'transfer-method' && index === reviewRows.length - 1}
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
            <ActivityIndicator color={colors.text.inverse} size="small" />
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
  error: { ...textStyles.caption, color: colors.semantic.destructive, marginTop: spacing[2] },
  hint: { ...textStyles.caption, color: colors.text.secondary, marginTop: spacing[2] },
  cta: { borderRadius: borderRadius.lg, overflow: 'hidden', marginTop: spacing[3] },
  ctaDisabled: { opacity: 0.7 },
  ctaGradient: { paddingVertical: spacing[4], alignItems: 'center' },
  ctaText: { ...textStyles.button, color: colors.text.inverse },
})
