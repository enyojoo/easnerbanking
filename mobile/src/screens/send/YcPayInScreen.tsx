import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { ArrowLeft, Check, Copy } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { formatMoneyDisplay } from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useFixedFooterPadding, useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles, borderRadius } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { ycBankInfoFields } from '../../lib/yc-bank-info-fields'
import { haptics } from '../../lib/haptics'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'

type RouteParams = {
  flowMode?: 'fund_balance' | 'cross_border_send'
  transactionId: string
  sendAmount: number
  sendCurrency: string
  receiveAmount: number
  receiveCurrency: string
  recipientName: string
  transferId: string
  localPayIn: number
  customerRate: number
  bankInfo: Record<string, unknown> | null
  payInNotice?: string
  payInRail: YcPayInRail
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
    </View>
  )
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <Pressable android_ripple={ripple.neutral} style={styles.row} onPress={onCopy}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.copyValueRow}>
        <Text style={styles.copyValue}>{value}</Text>
        {copied ? (
          <Check size={16} color={colors.primary.main} strokeWidth={2} />
        ) : (
          <Copy size={16} color={colors.text.secondary} strokeWidth={2} />
        )}
      </View>
    </Pressable>
  )
}

export default function YcPayInScreen({ navigation, route }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const footerPadding = useFixedFooterPadding(spacing[5])
  const copyToClipboard = useCopyToClipboard()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const params = (route.params || {}) as Partial<RouteParams>
  const {
    flowMode = 'cross_border_send',
    transactionId,
    sendCurrency = 'NGN',
    receiveAmount = 0,
    receiveCurrency = 'USD',
    recipientName = 'Recipient',
    transferId,
    localPayIn = 0,
    bankInfo,
    payInNotice,
    payInRail,
  } = params

  const fields = ycBankInfoFields(bankInfo)
  const isFundBalance = flowMode === 'fund_balance'
  const transferMethod = payInRail === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer'
  const screenTitle = isFundBalance ? 'Complete deposit' : 'Complete payment'
  const notice =
    payInNotice ||
    (isFundBalance
      ? 'Transfer the exact amount below to credit your USD balance.'
      : 'Transfer the exact amount below to complete this payment.')
  const displayTransactionId = transactionId?.toUpperCase() ?? ''

  const handleCopy = async (text: string, key: string) => {
    haptics.tap()
    await copyToClipboard(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  if (!transactionId || !transferId) {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary.main} />
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <View style={[styles.container, { paddingBottom: footerPadding }]}>
        <View style={styles.header}>
          <Pressable
            android_ripple={ripple.neutral}
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>{screenTitle}</Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {displayTransactionId ? (
              <Row label="Transaction ID" value={displayTransactionId} />
            ) : null}
            <Row label="You pay" value={formatMoneyDisplay(localPayIn, sendCurrency)} bold />
            {isFundBalance ? (
              <Row label="You receive" value={formatMoneyDisplay(receiveAmount, receiveCurrency)} />
            ) : (
              <>
                <Row label="Recipient gets" value={formatMoneyDisplay(receiveAmount, receiveCurrency)} />
                <Row label="Recipient" value={recipientName} />
              </>
            )}
            {payInRail ? <Row label="Transfer method" value={transferMethod} /> : null}

            {fields.length === 0 ? (
              <Text style={styles.error}>
                Payment details unavailable. Contact support with reference {displayTransactionId}.
              </Text>
            ) : (
              fields.map((field) => (
                <CopyRow
                  key={field.id}
                  label={field.label}
                  value={field.value}
                  copied={copiedKey === field.id}
                  onCopy={() => void handleCopy(field.value, field.id)}
                />
              ))
            )}

            <Text style={styles.hint}>{notice}</Text>
          </View>
        </ScrollView>

        <Pressable
          android_ripple={ripple.neutral}
          style={styles.cta}
          onPress={() => {
            haptics.medium()
            navigation.navigate('TransactionDetails' as never, { transactionId } as never)
          }}
        >
          <LinearGradient
            colors={colors.primary.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>I've made the payment</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing[5],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  backButton: {
    padding: spacing[1],
  },
  title: {
    ...textStyles.screenTitle,
  },
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
  rowLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  rowValue: {
    ...textStyles.body,
    textAlign: 'right',
    flex: 1,
  },
  rowValueBold: {
    fontFamily: textStyles.sectionTitle.fontFamily,
  },
  copyValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[2],
    flex: 1,
  },
  copyValue: {
    ...textStyles.body,
    fontFamily: 'monospace',
    textAlign: 'right',
    flexShrink: 1,
  },
  error: {
    ...textStyles.caption,
    color: colors.semantic.destructive,
    marginTop: spacing[2],
  },
  hint: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing[2],
  },
  cta: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginTop: spacing[3],
  },
  ctaGradient: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  ctaText: {
    ...textStyles.button,
    color: colors.text.inverse,
  },
})
