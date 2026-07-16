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
  formatMoneyDisplay,
  formatReviewRowMoneyDisplay,
  formatSendRateLabel,
  REVIEW_ROW_LABELS,
  normalizeYcMomoPhone,
} from '@easner/shared'
import type { Recipient } from '../../types'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { SendSelectedRecipientSummary } from './SendSelectedRecipientSummary'
import { TransactionDetailSummaryRow } from '../transactions/TransactionDetailSummaryRow'
import { YcMomoPhoneInput } from '../YcMomoPhoneInput'
import { useYcCrossBorderFlow, type YcPayInRail, type YcCrossBorderQuoteResult } from '../../hooks/useYcCrossBorderFlow'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'
import { haptics } from '../../lib/haptics'
import {
  ensurePayInNetworksCached,
  readCachedPayInNetworks,
} from '../../lib/sendFlowFundBalanceQuote'
import { useAuth } from '../../contexts/AuthContext'

type Props = {
  navigation: { goBack: () => void; navigate: (name: string, params?: object) => void }
  recipient: Recipient
  receiveAmount: number
  receiveCurrency: string
  payInCurrency: string
  payInCountry: string
  payInRail: YcPayInRail
  transactionId: string
  footerPadding: number
  listBottomPadding: number
}

type PayInNetwork = { id: string; name: string }

export function YcCrossBorderSendConfirm({
  navigation,
  recipient,
  receiveAmount,
  receiveCurrency,
  payInCurrency,
  payInCountry,
  payInRail,
  transactionId,
  footerPadding,
  listBottomPadding,
}: Props) {
  const { userProfile } = useAuth()
  const isMobileMoney = payInRail === 'mobile_money'
  const defaultPhone = userProfile?.phone ?? userProfile?.profile?.phone ?? ''

  const cachedNetworks = isMobileMoney
    ? readCachedPayInNetworks(payInCountry, payInCurrency)
    : null

  const [phone, setPhone] = useState(() =>
    defaultPhone ? normalizeYcMomoPhone(defaultPhone, payInCountry) : '',
  )
  const [networks, setNetworks] = useState<PayInNetwork[]>(() => cachedNetworks ?? [])
  const [networkId, setNetworkId] = useState(() =>
    cachedNetworks?.length === 1 ? cachedNetworks[0].id : '',
  )
  const [networksLoading, setNetworksLoading] = useState(
    isMobileMoney && !cachedNetworks?.length,
  )
  const [networksError, setNetworksError] = useState<string | null>(null)

  const [quote, setQuote] = useState<YcCrossBorderQuoteResult | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const ycFlow = useYcCrossBorderFlow({
    recipientId: recipient.id,
    enabled: true,
    receiveCurrency,
    amountEntryMode: 'receive',
    enteredAmount: receiveAmount,
  })

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
        const rows = await ensurePayInNetworksCached(payInCountry, payInCurrency)
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
  }, [isMobileMoney, payInCountry, payInCurrency, cachedNetworks?.length])

  useEffect(() => {
    if (isMobileMoney) return

    let cancelled = false
    setQuoteError(null)
    void (async () => {
      try {
        const result = await ycFlow.createQuote({ receiveAmount, payInRail })
        if (!cancelled) setQuote(result)
      } catch (e) {
        if (!cancelled) {
          setQuote(null)
          setQuoteError(e instanceof Error ? e.message : 'Could not load quote')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [recipient.id, receiveAmount, payInCurrency, payInRail, isMobileMoney])

  const quoteCountdown = useQuoteCountdown(quote?.expiresAt)
  const transferMethod = isMobileMoney ? 'Mobile Money' : 'Bank Transfer'
  const estimatedPayIn = ycFlow.preview.sendAmount
  const customerRate = quote?.customerRate ?? ycFlow.customerRate ?? 1
  const momoReady = Boolean(phone.trim() && networkId)
  const quoteReady = isMobileMoney
    ? Boolean(ycFlow.customerRate && estimatedPayIn > 0 && momoReady)
    : Boolean(quote?.transferId)
  const displayId = (quote?.transactionId || transactionId).toUpperCase()

  const navigateToPayIn = (q: YcCrossBorderQuoteResult) => {
    const selectedNetwork = networks.find((n) => n.id === networkId)
    navigation.navigate('YcPayIn', {
      flowMode: 'cross_border_send',
      transactionId: q.transactionId || transactionId,
      sendAmount: q.localPayIn,
      sendCurrency: payInCurrency,
      receiveAmount,
      receiveCurrency,
      recipientName: recipient.full_name || recipient.name || 'Recipient',
      transferId: q.transferId,
      localPayIn: q.localPayIn,
      customerRate: q.customerRate,
      bankInfo: q.bankInfo,
      payInNotice: q.payInNotice,
      payInRail,
      processingFeeLocal: q.displayProcessingFeeLocal,
      displayProcessingFee: q.displayProcessingFee,
      processingFee: q.processingFee,
      ycChannelFeeUsd: q.ycLegFeesUsd,
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
        const selectedNetwork = networks.find((n) => n.id === networkId)
        const result = await ycFlow.createQuote({
          receiveAmount,
          payInRail,
          sourcePhone: phone.trim(),
          networkId,
          sourceNetworkName: selectedNetwork?.name,
        })
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
        <Text style={styles.title}>Review transfer</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: listBottomPadding }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {!isMobileMoney && displayId ? (
            <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.transactionId} value={displayId} valueMono />
          ) : null}
          {!quoteReady && !quoteError && !isMobileMoney ? (
            <ActivityIndicator color={colors.primary.main} style={{ marginVertical: spacing[4] }} />
          ) : (
            <>
              {customerRate > 0 ? (
                <TransactionDetailSummaryRow
                  label={REVIEW_ROW_LABELS.exchangeRate}
                  value={formatSendRateLabel(payInCurrency, receiveCurrency, customerRate)}
                />
              ) : null}
              <TransactionDetailSummaryRow
                label={REVIEW_ROW_LABELS.estimatedToPay}
                value={formatReviewRowMoneyDisplay(
                  REVIEW_ROW_LABELS.estimatedToPay,
                  isMobileMoney ? estimatedPayIn : (quote?.localPayIn ?? estimatedPayIn),
                  payInCurrency,
                )}
              />
              <TransactionDetailSummaryRow
                label={REVIEW_ROW_LABELS.recipientGets}
                value={formatMoneyDisplay(receiveAmount, receiveCurrency)}
                valueBold
              />
              <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.recipient}>
                <View style={styles.recipientSummaryWrap}>
                  <SendSelectedRecipientSummary recipient={recipient} alignEnd />
                </View>
              </TransactionDetailSummaryRow>
              <TransactionDetailSummaryRow
                label={REVIEW_ROW_LABELS.transferMethod}
                value={transferMethod}
                last={!isMobileMoney}
              />
            </>
          )}

          {isMobileMoney ? (
            <View style={styles.momoSection}>
              <Text style={styles.fieldLabel}>{REVIEW_ROW_LABELS.mobileNumber}</Text>
              <YcMomoPhoneInput
                countryCode={payInCountry}
                value={phone}
                onChange={setPhone}
                placeholder="712345678"
              />
              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                {REVIEW_ROW_LABELS.paymentNetwork}
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
