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
  computeYcFundBalancePrincipalLocalPayIn,
  formatReviewRowMoneyDisplay,
  formatSendRateLabel,
  REVIEW_ROW_LABELS,
  shouldShowPayoutReviewFeeRow,
  normalizeYcMomoPhone,
} from '@easner/shared'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import type { YcFundBalanceQuoteResult } from '../../hooks/useYcFundBalanceFlow'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'
import { haptics } from '../../lib/haptics'
import { CreditDestinationRow } from '../transactions/CreditDestinationRow'
import { TransactionDetailSummaryRow } from '../transactions/TransactionDetailSummaryRow'
import { YcMomoPhoneInput } from '../YcMomoPhoneInput'
import {
  ensureFundBalanceQuoteStashed,
  ensurePayInNetworksCached,
  isCompleteFundBalanceQuote,
  isStashedFundBalanceQuoteFresh,
  peekFundBalanceQuote,
  peekLastFundBalanceQuoteError,
  readCachedPayInNetworks,
  type YcFundBalanceQuote,
} from '../../lib/sendFlowFundBalanceQuote'
import { useAuth } from '../../contexts/AuthContext'

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
  footerPadding: number
  listBottomPadding: number
}

type PayInNetwork = { id: string; name: string }

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
  footerPadding,
  listBottomPadding,
}: Props) {
  const { userProfile } = useAuth()
  const isMobileMoney = payInRail === 'mobile_money'
  const defaultPhone = userProfile?.phone ?? userProfile?.profile?.phone ?? ''

  const cachedNetworks = isMobileMoney
    ? readCachedPayInNetworks(residenceCountry, localPayInCurrency)
    : null

  const [phone, setPhone] = useState(() =>
    defaultPhone ? normalizeYcMomoPhone(defaultPhone, residenceCountry) : '',
  )
  const [networks, setNetworks] = useState<PayInNetwork[]>(() => cachedNetworks ?? [])
  const [networkId, setNetworkId] = useState(() =>
    cachedNetworks?.length === 1 ? cachedNetworks[0].id : '',
  )
  const [networksLoading, setNetworksLoading] = useState(
    isMobileMoney && !cachedNetworks?.length,
  )
  const [networksError, setNetworksError] = useState<string | null>(null)

  const quoteMeta = useMemo(
    () => ({
      country: residenceCountry,
      currency: localPayInCurrency,
      rail: payInRail,
      amountEntryMode,
      enteredAmount,
      sourcePhone: isMobileMoney ? phone.trim() : undefined,
      networkId: isMobileMoney ? networkId : undefined,
      sourceNetworkName: isMobileMoney
        ? networks.find((n) => n.id === networkId)?.name
        : undefined,
    }),
    [
      residenceCountry,
      localPayInCurrency,
      payInRail,
      amountEntryMode,
      enteredAmount,
      isMobileMoney,
      phone,
      networkId,
      networks,
    ],
  )

  const [quote, setQuote] = useState<YcFundBalanceQuoteResult | null>(() =>
    !isMobileMoney && isStashedFundBalanceQuoteFresh(quoteMeta) ? peekFundBalanceQuote() : null,
  )
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isMobileMoney) return
    let cancelled = false
    const hadCache = Boolean(cachedNetworks?.length)
    if (!hadCache) {
      setNetworksLoading(true)
    }
    setNetworksError(null)
    void (async () => {
      try {
        const rows = await ensurePayInNetworksCached(residenceCountry, localPayInCurrency)
        if (cancelled) return
        setNetworks(rows)
        if (rows.length === 1) setNetworkId(rows[0].id)
      } catch (e) {
        if (!cancelled) {
          setNetworksError(e instanceof Error ? e.message : 'Could not load networks')
        }
      } finally {
        if (!cancelled) setNetworksLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isMobileMoney, residenceCountry, localPayInCurrency, cachedNetworks?.length])

  useEffect(() => {
    if (isMobileMoney) return

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
  }, [quoteMeta, isMobileMoney])

  const quoteCountdown = useQuoteCountdown(quote?.expiresAt)
  const transferMethod = isMobileMoney ? 'Mobile Money' : 'Bank Transfer'
  const customerRate = quote?.customerRate ?? previewCustomerRate
  const displayTransactionId = quote?.easnerTransactionId ?? quote?.transactionId ?? ''
  const estimatedPayIn = localPayIn
  const estimatedCredit = usdCredit
  const resolvedLocalPayIn = quote?.localPayIn ?? estimatedPayIn
  const resolvedUsdCredit = quote?.usdCredit ?? estimatedCredit

  const reviewFeeLocal =
    !isMobileMoney && quote
      ? quote.displayProcessingFeeLocal ??
        (quote.displayProcessingFee != null && customerRate > 0
          ? Math.round(quote.displayProcessingFee * customerRate * 100) / 100
          : computeDisplayProcessingFee({
              processingFee: quote.processingFee ?? 0,
              exchangeFee: quote.ycChannelFeeUsd ?? quote.ycLegFeesUsd ?? 0,
            }) * (customerRate || 1))
      : isMobileMoney && customerRate > 0 && resolvedLocalPayIn > 0
        ? Math.max(
            0,
            Math.round((resolvedLocalPayIn - resolvedUsdCredit * customerRate) * 100) / 100,
          )
        : 0
  const reviewPrincipalLocal = computeYcFundBalancePrincipalLocalPayIn({
    usdCredit: resolvedUsdCredit,
    exchangeRate: customerRate,
  })

  const payAmountLabel = isMobileMoney
    ? REVIEW_ROW_LABELS.estimatedToPay
    : REVIEW_ROW_LABELS.totalToPay
  const creditAmountLabel = REVIEW_ROW_LABELS.amountToCredit
  const showReviewFee =
    reviewFeeLocal > 0 ||
    (!isMobileMoney &&
      shouldShowPayoutReviewFeeRow({
        processingFee: quote?.processingFee ?? 0,
        exchangeFee: quote?.ycChannelFeeUsd ?? quote?.ycLegFeesUsd ?? 0,
      }))

  const momoReady = Boolean(phone.trim() && networkId)
  const bankQuoteReady = Boolean(quote?.transferId)
  const quoteReady = isMobileMoney ? previewCustomerRate > 0 && estimatedPayIn > 0 && momoReady : bankQuoteReady

  const navigateToPayIn = (q: YcFundBalanceQuote) => {
    const selectedNetwork = networks.find((n) => n.id === networkId)
    navigation.navigate('YcPayIn', {
      flowMode: 'fund_balance',
      transactionId: q.easnerTransactionId ?? q.transactionId,
      sendCurrency: localPayInCurrency,
      receiveAmount: q.usdCredit,
      receiveCurrency: 'USD',
      recipientName: 'your USD balance',
      transferId: q.transferId,
      localPayIn: q.localPayIn,
      customerRate: q.customerRate,
      bankInfo: q.bankInfo ?? null,
      payInNotice: q.payInNotice,
      payInRail,
      processingFeeLocal: q.displayProcessingFeeLocal,
      displayProcessingFee: q.displayProcessingFee,
      sourcePhone: q.sourcePhone ?? phone.trim(),
      sourceNetworkId: q.sourceNetworkId ?? networkId,
      sourceNetworkName: q.sourceNetworkName ?? selectedNetwork?.name,
    })
  }

  const onContinue = async () => {
    if (submitting) return
    haptics.medium()
    setSubmitting(true)
    setQuoteError(null)

    try {
      if (isMobileMoney) {
        const result = await ensureFundBalanceQuoteStashed(quoteMeta)
        if (!isCompleteFundBalanceQuote(result)) {
          setQuoteError(peekLastFundBalanceQuoteError() || 'Could not load quote')
          return
        }
        navigateToPayIn(result)
        return
      }

      if (!quote) return
      navigateToPayIn(quote)
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : 'Could not continue')
    } finally {
      setSubmitting(false)
    }
  }

  const ctaDisabled =
    !quoteReady || Boolean(quoteError) || (!isMobileMoney && quoteCountdown.expired) || submitting

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
          {!isMobileMoney && displayTransactionId ? (
            <TransactionDetailSummaryRow
              label={REVIEW_ROW_LABELS.transactionId}
              value={displayTransactionId.toUpperCase()}
              valueMono
            />
          ) : null}
          {!quoteReady && !quoteError && !isMobileMoney ? (
            <ActivityIndicator color={colors.primary.main} style={{ marginVertical: spacing[4] }} />
          ) : (
            <>
              {customerRate > 0 ? (
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.exchangeRate}
                  value={formatSendRateLabel('USD', localPayInCurrency, customerRate)}
                />
              ) : null}
              {reviewPrincipalLocal > 0 ? (
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.depositAmount}
                  value={formatReviewRowMoneyDisplay(
                    REVIEW_ROW_LABELS.depositAmount,
                    reviewPrincipalLocal,
                    localPayInCurrency,
                  )}
                />
              ) : null}
              {showReviewFee && reviewFeeLocal > 0 ? (
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.processingFee}
                  value={formatReviewRowMoneyDisplay(
                    REVIEW_ROW_LABELS.processingFee,
                    reviewFeeLocal,
                    localPayInCurrency,
                  )}
                />
              ) : null}
              <TransactionDetailSummaryRow
                label={payAmountLabel}
                value={formatReviewRowMoneyDisplay(
                  payAmountLabel,
                  isMobileMoney ? estimatedPayIn : resolvedLocalPayIn,
                  localPayInCurrency,
                )}
                valueBold
              />
              <TransactionDetailSummaryRow
                label={creditAmountLabel}
                value={formatReviewRowMoneyDisplay(
                  creditAmountLabel,
                  resolvedUsdCredit,
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
                last={!isMobileMoney}
              />
            </>
          )}

          {isMobileMoney ? (
            <View style={styles.momoSection}>
              <Text style={styles.fieldLabel}>{REVIEW_ROW_LABELS.momoNumberPrompt}</Text>
              <YcMomoPhoneInput
                countryCode={residenceCountry}
                value={phone}
                onChange={setPhone}
                placeholder="712345678"
              />
              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                {REVIEW_ROW_LABELS.momoNetworkPrompt}
              </Text>
              {networksLoading ? (
                <ActivityIndicator color={colors.primary.main} style={{ marginVertical: spacing[3] }} />
              ) : networksError ? (
                <Text style={styles.error}>{networksError}</Text>
              ) : (
                <View style={styles.networkList}>
                  {networks.map((network) => {
                    const selected = network.id === networkId
                    return (
                      <Pressable
                        key={network.id}
                        android_ripple={ripple.neutral}
                        style={[styles.networkOption, selected && styles.networkOptionSelected]}
                        onPress={() => {
                          haptics.tap()
                          setNetworkId(network.id)
                        }}
                      >
                        <Text
                          style={[
                            styles.networkOptionText,
                            selected && styles.networkOptionTextSelected,
                          ]}
                        >
                          {network.name}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </View>
          ) : null}

          {quoteError ? <Text style={styles.error}>{quoteError}</Text> : null}
          {!isMobileMoney && quote?.expiresAt ? (
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
  momoSection: { paddingTop: spacing[4] },
  fieldLabel: { ...textStyles.caption, color: colors.text.secondary, marginBottom: spacing[2] },
  fieldLabelSpaced: { marginTop: spacing[4] },
  input: {
    ...textStyles.body,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.light,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    color: colors.text.primary,
  },
  networkList: { gap: spacing[2] },
  networkOption: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.light,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
  },
  networkOptionSelected: {
    borderColor: colors.primary.main,
    backgroundColor: colors.primary.main + '12',
  },
  networkOptionText: { ...textStyles.body, color: colors.text.primary },
  networkOptionTextSelected: { fontFamily: textStyles.sectionTitle.fontFamily },
  error: { ...textStyles.caption, color: colors.semantic.destructive, marginTop: spacing[2] },
  hint: { ...textStyles.caption, color: colors.text.secondary, marginTop: spacing[2] },
  cta: { borderRadius: borderRadius.lg, overflow: 'hidden', marginTop: spacing[3] },
  ctaDisabled: { opacity: 0.7 },
  ctaGradient: { paddingVertical: spacing[4], alignItems: 'center' },
  ctaText: { ...textStyles.button, color: colors.text.inverse },
})
