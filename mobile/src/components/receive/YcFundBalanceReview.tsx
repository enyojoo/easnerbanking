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
  computeDisplayProcessingFee,
  formatMoneyDisplay,
  formatReviewRowMoneyDisplay,
  formatSendRateLabel,
  REVIEW_ROW_LABELS,
  shouldShowPayoutReviewFeeRow,
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
  ensureFundBalanceQuoteStashed,
  isCompleteFundBalanceQuote,
  isStashedFundBalanceQuoteFresh,
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
  footerPadding: number
  listBottomPadding: number
}

function resolveDisplayProcessingFee(quote: YcFundBalanceQuote | YcFundBalanceQuoteResult | null): number {
  if (!quote) return 0
  if (quote.displayProcessingFee != null && quote.displayProcessingFee > 0) {
    return quote.displayProcessingFee
  }
  return computeDisplayProcessingFee({
    processingFee: quote.processingFee ?? 0,
    exchangeFee: quote.ycChannelFeeUsd ?? 0,
  })
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
  footerPadding,
  listBottomPadding,
}: Props) {
  const quoteMeta = useMemo(
    () => ({
      country: residenceCountry,
      currency: localPayInCurrency,
      rail: payInRail,
      amountEntryMode,
      enteredAmount,
    }),
    [residenceCountry, localPayInCurrency, payInRail, amountEntryMode, enteredAmount],
  )

  const [quote, setQuote] = useState<YcFundBalanceQuoteResult | null>(() =>
    isStashedFundBalanceQuoteFresh({
      country: residenceCountry,
      currency: localPayInCurrency,
      rail: payInRail,
      amountEntryMode,
      enteredAmount,
    })
      ? peekFundBalanceQuote()
      : null,
  )
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isStashedFundBalanceQuoteFresh(quoteMeta)) {
      const stashed = peekFundBalanceQuote()
      if (stashed) {
        setQuote(stashed)
        setQuoteError(null)
      }
      return
    }

    let cancelled = false
    setQuoteError(null)
    void (async () => {
      const result = await ensureFundBalanceQuoteStashed(quoteMeta)
      if (cancelled) return
      if (isCompleteFundBalanceQuote(result)) {
        setQuote(result)
        return
      }
      setQuote(null)
      setQuoteError(peekLastFundBalanceQuoteError() || 'Could not load quote')
    })()

    return () => {
      cancelled = true
    }
  }, [quoteMeta])

  const quoteCountdown = useQuoteCountdown(quote?.expiresAt)
  const transferMethod = payInRail === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer'
  const displayProcessingFee = resolveDisplayProcessingFee(quote)
  const showProcessingFee = shouldShowPayoutReviewFeeRow({
    processingFee: quote?.processingFee ?? 0,
    exchangeFee: quote?.ycChannelFeeUsd ?? 0,
  })
  const customerRate = quote?.customerRate ?? 0
  const displayTransactionId =
    quote?.easnerTransactionId ?? quote?.transactionId ?? ''
  const quoteReady = Boolean(quote?.transferId)

  const onContinue = () => {
    if (!quote || submitting) return
    haptics.medium()
    setSubmitting(true)
    navigation.navigate('YcPayIn', {
      flowMode: 'fund_balance',
      transactionId: displayTransactionId || quote.transactionId,
      sendCurrency: localPayInCurrency,
      receiveAmount: quote.usdCredit,
      receiveCurrency: 'USD',
      recipientName: 'your USD balance',
      transferId: quote.transferId,
      localPayIn: quote.localPayIn,
      customerRate: quote.customerRate,
      bankInfo: quote.bankInfo,
      payInNotice: quote.payInNotice,
      payInRail,
    })
    setSubmitting(false)
  }

  const ctaDisabled = !quoteReady || Boolean(quoteError) || quoteCountdown.expired || submitting

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
          {displayTransactionId ? (
            <TransactionDetailSummaryRow
              label={REVIEW_ROW_LABELS.transactionId}
              value={displayTransactionId.toUpperCase()}
              valueMono
            />
          ) : null}
          {!quoteReady && !quoteError ? (
            <ActivityIndicator color={colors.primary.main} style={{ marginVertical: spacing[4] }} />
          ) : (
            <>
              <TransactionDetailSummaryRow
                label={REVIEW_ROW_LABELS.amountToPay}
                value={formatReviewRowMoneyDisplay(
                  REVIEW_ROW_LABELS.amountToPay,
                  quote?.localPayIn ?? localPayIn,
                  localPayInCurrency,
                )}
              />
              {showProcessingFee ? (
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.processingFee}
                  value={formatReviewRowMoneyDisplay(
                    REVIEW_ROW_LABELS.processingFee,
                    displayProcessingFee,
                    'USD',
                  )}
                />
              ) : null}
              {customerRate > 0 ? (
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.exchangeRate}
                  value={formatSendRateLabel('USD', localPayInCurrency, customerRate)}
                />
              ) : null}
              <TransactionDetailSummaryRow
                label={REVIEW_ROW_LABELS.amountToCredit}
                value={formatReviewRowMoneyDisplay(
                  REVIEW_ROW_LABELS.amountToCredit,
                  quote?.usdCredit ?? usdCredit,
                  'USD',
                )}
                valueBold
              />
              <CreditDestinationRow
                label={REVIEW_ROW_LABELS.creditTo}
                currency="USD"
                balanceLabel="USD Balance"
              />
              <TransactionDetailSummaryRow
                label={REVIEW_ROW_LABELS.transferMethod}
                value={transferMethod}
                last
              />
            </>
          )}
          {quoteError ? <Text style={styles.error}>{quoteError}</Text> : null}
          {quote?.expiresAt ? (
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
        onPress={onContinue}
        disabled={ctaDisabled}
      >
        <LinearGradient
          colors={ctaDisabled ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaGradient}
        >
          <Text style={styles.ctaText}>{submitting ? 'Loading…' : 'Continue'}</Text>
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
