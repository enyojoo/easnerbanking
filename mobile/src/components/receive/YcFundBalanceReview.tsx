import React, { useCallback, useMemo, useState } from 'react'
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
  useYcFundBalancePayInLock,
  useYcPayInAttest,
  YC_PAY_IN_REVIEW_AND_COMPLETE_TITLE,
  ycPayInCompleteCta,
  type YcLocalPayInReviewPhase,
} from '@easner/shared'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'
import { haptics } from '../../lib/haptics'
import { CreditDestinationRow } from '../transactions/CreditDestinationRow'
import {
  TransactionDetailSummaryRow,
  TransactionDetailCopyableValue,
} from '../transactions/TransactionDetailSummaryRow'
import { YcPayInPaymentBlock } from '../yc/YcPayInPaymentBlock'
import { YcPayInAwaitingPaymentCountdown } from '../yc/YcPayInAwaitingPaymentCountdown'
import { navigateToTransactionDetailAfterPayIn } from '../../navigation/transactionDetailNavigation'
import { attestYcPayInPayment } from '../../lib/ycPayInAttest'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import {
  ensureFundBalanceOrderConfirmed,
  isCompleteFundBalanceQuote,
  isStashedFundBalanceQuoteFresh,
  peekFundBalanceQuote,
  peekLastFundBalanceQuoteError,
  type FundBalanceQuoteStashMeta,
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

function fundBalanceLockKey(meta: FundBalanceQuoteStashMeta): string {
  return [
    meta.country,
    meta.currency,
    meta.rail,
    meta.amountEntryMode,
    meta.enteredAmount,
    meta.sourcePhone ?? '',
    meta.networkId ?? '',
  ].join('|')
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyToClipboard = useCopyToClipboard()

  const quoteMeta = useMemo(
    (): FundBalanceQuoteStashMeta => ({
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

  const lockKey = fundBalanceLockKey(quoteMeta)

  const getCachedLocked = useCallback((): YcFundBalanceQuote | null => {
    if (!isStashedFundBalanceQuoteFresh(quoteMeta)) return null
    const cached = peekFundBalanceQuote()
    return cached && isCompleteFundBalanceQuote(cached) ? cached : null
  }, [quoteMeta])

  const stashedLocked = getCachedLocked()

  const { quote: lockedQuote, isLocked, isLoading, error: lockError } = useYcFundBalancePayInLock<YcFundBalanceQuote>({
    enabled: Boolean(lockKey),
    lockKey,
    getCachedLocked,
    isLocked: isCompleteFundBalanceQuote,
    confirmOrder: () => ensureFundBalanceOrderConfirmed(quoteMeta),
    getErrorMessage: peekLastFundBalanceQuoteError,
  })

  const activeLockedQuote = lockedQuote ?? stashedLocked
  const displayLocked = isLocked || Boolean(stashedLocked)
  const reviewPhase: YcLocalPayInReviewPhase = displayLocked ? 'locked' : 'preview'
  const displayQuote = activeLockedQuote
  const quoteCountdown = useQuoteCountdown(displayQuote?.expiresAt)
  const customerRate = displayQuote?.customerRate ?? previewCustomerRate
  const displayTransactionId =
    activeLockedQuote?.easnerTransactionId ?? activeLockedQuote?.transactionId ?? ''
  const resolvedLocalPayIn = displayQuote?.localPayIn ?? localPayIn
  const resolvedUsdCredit = displayQuote?.usdCredit ?? usdCredit

  const reviewBreakdown =
    resolvedLocalPayIn > 0
      ? resolveYcFundBalanceLocalPayInBreakdownForDisplay({
          localPayIn: resolvedLocalPayIn,
          localCurrency: localPayInCurrency,
          usdCredit: resolvedUsdCredit,
          exchangeRate: customerRate,
          displayProcessingFeeLocal: displayQuote?.displayProcessingFeeLocal,
          processingFee: displayQuote?.processingFee,
          exchangeFee: displayQuote?.ycChannelFeeUsd ?? displayQuote?.ycLegFeesUsd,
        })
      : null
  const reviewPrincipalLocal =
    reviewBreakdown?.principalLocal ??
    computeYcFundBalancePrincipalLocalPayIn({
      usdCredit: resolvedUsdCredit,
      exchangeRate: customerRate,
    })
  const reviewFeeLocal = reviewBreakdown?.feeLocal ?? 0

  const reviewRows = buildYcLocalPayInReviewRows({
    mode: 'fund_balance',
    phase: reviewPhase,
    rail: payInRail,
    payInCurrency: localPayInCurrency,
    receiveCurrency: 'USD',
    customerRate,
    localPayIn: resolvedLocalPayIn,
    receiveAmount: resolvedUsdCredit,
    processingFeeLocal: reviewFeeLocal,
    processingFeeUsd: displayQuote?.processingFee,
    exchangeFeeUsd: displayQuote?.ycChannelFeeUsd ?? displayQuote?.ycLegFeesUsd,
    principalLocal: reviewPrincipalLocal,
    usdCredit: resolvedUsdCredit,
    transactionId: displayTransactionId || undefined,
  })

  const { attestLoading, attestError, attestPayment } = useYcPayInAttest({
    attest: attestYcPayInPayment,
    onSuccess: (transactionId) => {
      navigateToTransactionDetailAfterPayIn(navigation, transactionId, 'ReceiveFlow')
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

  if (!displayLocked && isLoading) {
    return (
      <View style={[styles.container, { paddingBottom: footerPadding }]}>
        <View style={styles.header}>
          <Pressable android_ripple={ripple.neutral} onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>{YC_PAY_IN_REVIEW_AND_COMPLETE_TITLE}</Text>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary.main} size="large" />
        </View>
      </View>
    )
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
        {displayLocked && reviewRows.length > 0 ? (
          <View style={styles.card}>
            {reviewRows.map((row, index) => {
              if (row.id === 'amount-to-credit') {
                return (
                  <React.Fragment key={row.id}>
                    <TransactionDetailSummaryRow
                      label={row.label}
                      value={row.value}
                      valueBold={row.valueBold}
                    />
                    <CreditDestinationRow
                      label={REVIEW_ROW_LABELS.creditTo}
                      currency="USD"
                      balanceLabel="USD Balance"
                    />
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
                  last={row.id === 'transfer-method' && index === reviewRows.length - 1}
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
              localPayIn={resolvedLocalPayIn}
              localCurrency={localPayInCurrency}
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
            <ActivityIndicator color={colors.text.inverse} size="small" />
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
  countdownWrap: {
    marginBottom: spacing[2],
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[8],
  },
  error: { ...textStyles.caption, color: colors.semantic.destructive, marginTop: spacing[2] },
  cta: { borderRadius: borderRadius.lg, overflow: 'hidden', marginTop: spacing[3] },
  ctaDisabled: { opacity: 0.7 },
  ctaGradient: { paddingVertical: spacing[4], alignItems: 'center' },
  ctaText: { ...textStyles.button, color: colors.text.inverse },
})
