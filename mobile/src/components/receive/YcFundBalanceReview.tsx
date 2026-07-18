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
  ensureFundBalanceOrderConfirmed,
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
  const [quoteLoading, setQuoteLoading] = useState(
    () => !isMobileMoney && !isStashedFundBalanceQuoteFresh(quoteMeta),
  )
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const momoReady = Boolean(phone.trim() && networkId)

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
    if (isMobileMoney && !momoReady) {
      setQuote(null)
      setQuoteLoading(false)
      setQuoteError(null)
      return
    }

    if (isStashedFundBalanceQuoteFresh(quoteMeta)) {
      const stashed = peekFundBalanceQuote()
      if (stashed) {
        setQuote(stashed)
        setQuoteError(null)
      }
      setQuoteLoading(false)
      return
    }

    let cancelled = false
    setQuoteLoading(true)
    setQuoteError(null)
    void (async () => {
      const result = await ensureFundBalanceQuoteStashed(quoteMeta)
      if (cancelled) return
      setQuoteLoading(false)
      if (result?.ok && result.localPayIn > 0) {
        setQuote(result)
        return
      }
      setQuote(null)
      setQuoteError(peekLastFundBalanceQuoteError() || 'Could not load quote')
    })()

    return () => {
      cancelled = true
    }
  }, [quoteMeta, isMobileMoney, momoReady])

  const quoteCountdown = useQuoteCountdown(quote?.expiresAt)
  const quoteLocked = Boolean(quote?.ok && quote.localPayIn > 0)
  const customerRate = quote?.customerRate ?? previewCustomerRate
  const displayTransactionId = quote?.easnerTransactionId ?? quote?.transactionId ?? ''
  const resolvedLocalPayIn = quote?.localPayIn ?? localPayIn
  const resolvedUsdCredit = quote?.usdCredit ?? usdCredit

  const lockedReviewBreakdown =
    quoteLocked && resolvedLocalPayIn > 0
      ? resolveYcFundBalanceLocalPayInBreakdownForDisplay({
          localPayIn: resolvedLocalPayIn,
          localCurrency: localPayInCurrency,
          usdCredit: resolvedUsdCredit,
          exchangeRate: customerRate,
          displayProcessingFeeLocal: quote?.displayProcessingFeeLocal,
          processingFee: quote?.processingFee,
          exchangeFee: quote?.ycChannelFeeUsd ?? quote?.ycLegFeesUsd,
        })
      : null
  const reviewPrincipalLocal =
    lockedReviewBreakdown?.principalLocal ??
    computeYcFundBalancePrincipalLocalPayIn({
      usdCredit: resolvedUsdCredit,
      exchangeRate: customerRate,
    })
  const reviewFeeLocal = lockedReviewBreakdown?.feeLocal ?? 0

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
        processingFeeUsd: quote?.processingFee,
        exchangeFeeUsd: quote?.ycChannelFeeUsd ?? quote?.ycLegFeesUsd,
        principalLocal: reviewPrincipalLocal,
        usdCredit: resolvedUsdCredit,
        transactionId: displayTransactionId,
      })
    : []

  const showQuoteSpinner = quoteLoading && (isMobileMoney ? momoReady : true)

  const navigateToPayIn = (q: YcFundBalanceQuote) => {
    const selectedNetwork = networks.find((n) => n.id === networkId)
    const baseParams = {
      flowMode: 'fund_balance' as const,
      transactionId: q.easnerTransactionId ?? q.transactionId,
      sendCurrency: localPayInCurrency,
      transferId: q.transferId,
      localPayIn: q.localPayIn,
      bankInfo: q.bankInfo ?? null,
      payInNotice: q.payInNotice,
      payInRail,
      sourcePhone: q.sourcePhone ?? phone.trim(),
      sourceNetworkId: q.sourceNetworkId ?? networkId,
      sourceNetworkName: q.sourceNetworkName ?? selectedNetwork?.name,
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
    if (submitting) return
    haptics.medium()
    setSubmitting(true)
    setQuoteError(null)

    try {
      const result = await ensureFundBalanceOrderConfirmed(quoteMeta)
      if (!isCompleteFundBalanceQuote(result)) {
        setQuoteError(peekLastFundBalanceQuoteError() || 'Could not confirm order')
        return
      }
      navigateToPayIn(result)
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : 'Could not continue')
    } finally {
      setSubmitting(false)
    }
  }

  const ctaDisabled =
    !quoteLocked || quoteLoading || quoteCountdown.expired || submitting || Boolean(quoteError)

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

          {showQuoteSpinner ? (
            <ActivityIndicator color={colors.primary.main} style={{ marginVertical: spacing[4] }} />
          ) : quoteLocked ? (
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
                      <CreditDestinationRow
                        label={REVIEW_ROW_LABELS.creditTo}
                        currency="USD"
                        balanceLabel="USD Balance"
                      />
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
          ) : isMobileMoney && !momoReady ? (
            <Text style={styles.hint}>Enter your mobile money number and network to see fees.</Text>
          ) : null}

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
  momoSection: { paddingBottom: spacing[4] },
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
