import React, { useEffect, useState } from 'react'
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
import { formatMoneyDisplay, formatSendRateLabel } from '@easner/shared'
import type { Recipient } from '../../types'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { SendSelectedRecipientSummary } from './SendSelectedRecipientSummary'
import { useYcCrossBorderFlow, type YcPayInRail, type YcCrossBorderQuoteResult } from '../../hooks/useYcCrossBorderFlow'
import { useQuoteCountdown } from '../../hooks/useQuoteCountdown'
import { haptics } from '../../lib/haptics'

type Props = {
  navigation: { goBack: () => void; navigate: (name: string, params?: object) => void }
  recipient: Recipient
  receiveAmount: number
  receiveCurrency: string
  payInCurrency: string
  payInRail: YcPayInRail
  transactionId: string
  footerPadding: number
  listBottomPadding: number
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
    </View>
  )
}

export function YcCrossBorderSendConfirm({
  navigation,
  recipient,
  receiveAmount,
  receiveCurrency,
  payInCurrency,
  payInRail,
  transactionId,
  footerPadding,
  listBottomPadding,
}: Props) {
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
  }, [recipient.id, receiveAmount, payInCurrency, payInRail])

  const quoteCountdown = useQuoteCountdown(quote?.expiresAt)
  const transferMethod = payInRail === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer'
  const youSend = quote?.localPayIn ?? 0
  const processingFee = quote?.processingFee ?? 0
  const customerRate = quote?.customerRate ?? ycFlow.customerRate ?? 1
  const quoteReady = Boolean(quote?.transferId)
  const displayId = (quote?.transactionId || transactionId).toUpperCase()

  const onContinue = () => {
    if (!quote || submitting) return
    haptics.medium()
    setSubmitting(true)
    navigation.navigate('YcPayIn', {
      transactionId: quote.transactionId || transactionId,
      sendAmount: quote.localPayIn,
      sendCurrency: payInCurrency,
      receiveAmount,
      receiveCurrency,
      recipientName: recipient.full_name || recipient.name || 'Recipient',
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
        <Text style={styles.title}>Review transfer</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: listBottomPadding }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {displayId ? <Row label="Transaction ID" value={displayId} /> : null}
          {!quoteReady && !quoteError ? (
            <ActivityIndicator color={colors.primary.main} style={{ marginVertical: spacing[4] }} />
          ) : (
            <>
              <Row label="You pay" value={formatMoneyDisplay(youSend, payInCurrency)} />
              {processingFee > 0 ? (
                <Row label="Processing fee" value={formatMoneyDisplay(processingFee, payInCurrency)} />
              ) : null}
              {customerRate > 0 ? (
                <Row
                  label="Exchange rate"
                  value={formatSendRateLabel(payInCurrency, receiveCurrency, customerRate)}
                />
              ) : null}
              <Row label="Total" value={formatMoneyDisplay(youSend, payInCurrency)} bold />
              <Row label="Recipient gets" value={formatMoneyDisplay(receiveAmount, receiveCurrency)} />
              <View style={styles.recipientRow}>
                <Text style={styles.rowLabel}>Recipient</Text>
                <SendSelectedRecipientSummary recipient={recipient} alignEnd />
              </View>
              <Row label="Transfer method" value={transferMethod} />
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
    gap: spacing[1],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  rowLabel: { ...textStyles.caption, color: colors.text.secondary, flex: 1 },
  rowValue: { ...textStyles.body, textAlign: 'right', flex: 1 },
  rowValueBold: { fontFamily: textStyles.sectionTitle.fontFamily },
  recipientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  error: { ...textStyles.caption, color: colors.semantic.destructive, marginTop: spacing[2] },
  hint: { ...textStyles.caption, color: colors.text.secondary, marginTop: spacing[2] },
  cta: { borderRadius: borderRadius.lg, overflow: 'hidden', marginTop: spacing[3] },
  ctaDisabled: { opacity: 0.7 },
  ctaGradient: { paddingVertical: spacing[4], alignItems: 'center' },
  ctaText: { ...textStyles.button, color: colors.text.inverse },
})
