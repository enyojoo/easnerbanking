import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { ArrowLeft, Check, Copy, Landmark, Smartphone } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  formatMoneyDisplay,
  ycPayInInstructionNotice,
  ycPayInSendingExactlyCopy,
  REVIEW_ROW_LABELS,
} from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useFixedFooterPadding, useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles, borderRadius, surfaceFrameStyle } from '../../theme'
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
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
    transferId,
    localPayIn = 0,
    bankInfo,
    payInNotice,
    payInRail = 'bank_transfer',
  } = params

  const fields = ycBankInfoFields(bankInfo)
  const isFundBalance = flowMode === 'fund_balance'
  const isMobileMoney = payInRail === 'mobile_money'
  const screenTitle = isFundBalance ? 'Complete deposit' : 'Complete payment'
  const formattedSendAmount = formatMoneyDisplay(localPayIn, sendCurrency)
  const formattedCreditAmount = formatMoneyDisplay(receiveAmount, receiveCurrency)
  const notice = payInNotice || ycPayInInstructionNotice(payInRail)
  const displayTransactionId = transactionId?.toUpperCase() ?? ''
  const paymentDetailsTitle = isMobileMoney ? 'Mobile Money' : 'Bank Account'
  const PaymentIcon = isMobileMoney ? Smartphone : Landmark

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
          <View style={styles.summaryCard}>
            {displayTransactionId ? (
              <SummaryRow label={REVIEW_ROW_LABELS.transactionId} value={displayTransactionId} />
            ) : null}
            {isFundBalance ? (
              <SummaryRow label={REVIEW_ROW_LABELS.creditAmount} value={formattedCreditAmount} />
            ) : (
              <SummaryRow label={REVIEW_ROW_LABELS.paymentAmount} value={formattedSendAmount} />
            )}
          </View>

          <Text style={[styles.sendingExactly, isFundBalance && styles.sendingExactlyProminent]}>
            {ycPayInSendingExactlyCopy(formattedSendAmount)}
          </Text>

          {isFundBalance ? (
            <Text style={[styles.noticeText, styles.noticeTextCentered]}>{notice}</Text>
          ) : (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          )}

          <View style={[styles.paymentCard, surfaceFrameStyle(colors)]}>
            <View style={styles.paymentCardHeader}>
              <PaymentIcon size={20} color={colors.primary.main} strokeWidth={2} />
              <Text style={styles.paymentCardTitle}>{paymentDetailsTitle}</Text>
            </View>
            {fields.length === 0 ? (
              <Text style={styles.emptyFields}>
                Payment details unavailable. Contact support with reference {displayTransactionId}.
              </Text>
            ) : (
              fields.map((field) => (
                <Pressable
                  key={field.id}
                  android_ripple={ripple.neutral}
                  style={styles.fieldRow}
                  onPress={() => void handleCopy(field.value, field.id)}
                >
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <View style={styles.fieldValueRow}>
                    <Text style={styles.fieldValue}>{field.value}</Text>
                    {copiedKey === field.id ? (
                      <Check size={16} color={colors.primary.main} strokeWidth={2} />
                    ) : (
                      <Copy size={16} color={colors.text.secondary} strokeWidth={2} />
                    )}
                  </View>
                </Pressable>
              ))
            )}
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
  summaryCard: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    gap: spacing[1],
    marginBottom: spacing[4],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  summaryLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  summaryValue: {
    ...textStyles.body,
    textAlign: 'right',
    flex: 1,
    fontFamily: textStyles.sectionTitle.fontFamily,
  },
  sendingExactly: {
    ...textStyles.body,
    color: colors.text.primary,
    marginBottom: spacing[4],
  },
  sendingExactlyProminent: {
    ...textStyles.headlineMedium,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  noticeBox: {
    backgroundColor: colors.semantic.muted,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
  },
  noticeText: {
    ...textStyles.body,
    color: colors.text.primary,
  },
  noticeTextCentered: {
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[5],
    paddingHorizontal: spacing[2],
  },
  paymentCard: {
    padding: spacing[4],
    borderRadius: borderRadius.xl,
  },
  paymentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  paymentCardTitle: {
    ...textStyles.sectionTitle,
  },
  emptyFields: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  fieldRow: {
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  fieldLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing[1],
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  fieldValue: {
    ...textStyles.body,
    fontFamily: 'monospace',
    flex: 1,
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
