import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { Check, Copy, Landmark, Smartphone } from 'lucide-react-native'
import {
  formatMoneyDisplay,
  ycPayInCompleteNotice,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  REVIEW_ROW_LABELS,
  type YcPayInPaymentDetails,
} from '@easner/shared'
import PremiumModalSheet from '../premium/PremiumModalSheet'
import { YcLocalPayInCompleteSummary } from './YcLocalPayInCompleteSummary'
import { YcPayInAwaitingPaymentCountdown } from './YcPayInAwaitingPaymentCountdown'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { ycBankInfoFields } from '../../lib/yc-bank-info-fields'
import { colors, spacing, textStyles, borderRadius } from '../../theme'
import { ripple } from '../../lib/androidRipple'

type Props = {
  visible: boolean
  onClose: () => void
  details: YcPayInPaymentDetails
}

export function YcPayInPaymentDetailsSheet({ visible, onClose, details }: Props) {
  const copyToClipboard = useCopyToClipboard()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const isMomo = details.payInRail === 'mobile_money'
  const payInAmount = formatMoneyDisplay(details.localPayIn, details.localCurrency)
  const completeNotice = details.payInNotice ?? ycPayInCompleteNotice(details.payInRail)
  const bankFields = ycBankInfoFields(details.bankInfo)
  const PaymentIcon = isMomo ? Smartphone : Landmark
  const creditOrReceiveAmount = details.receiveAmount ?? 0
  const creditOrReceiveCurrency =
    details.receiveCurrency ?? (details.flowMode === 'fund_balance' ? 'USD' : '')

  const handleCopy = async (text: string, field: string) => {
    await copyToClipboard(text)
    setCopiedKey(field)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <PremiumModalSheet visible={visible} onRequestClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>Payment details</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <YcLocalPayInCompleteSummary
            flowMode={details.flowMode}
            transactionId={details.transactionId}
            localPayIn={details.localPayIn}
            localCurrency={details.localCurrency}
            creditOrReceiveAmount={creditOrReceiveAmount}
            creditOrReceiveCurrency={creditOrReceiveCurrency}
            customerRate={details.customerRate ?? 0}
            provisionalPayIn={details.provisionalPayIn}
            processingFeeLocal={details.displayProcessingFeeLocal ?? 0}
            payInRail={details.payInRail}
            recipientName={details.recipientName}
            copiedField={copiedKey}
            onCopy={handleCopy}
          />
        </View>

        {details.depositExpiresAt ? (
          <YcPayInAwaitingPaymentCountdown depositExpiresAt={details.depositExpiresAt} />
        ) : null}

        {completeNotice || !isMomo ? (
          <View style={styles.noticeBlock}>
            {completeNotice ? (
              <Text style={styles.notice}>{completeNotice}</Text>
            ) : null}
            {!isMomo ? (
              <Text style={styles.sendExactly}>
                {YC_PAY_IN_SEND_EXACTLY_LABEL}{' '}
                <Text style={styles.sendExactlyAmount}>{payInAmount}</Text>
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.paymentHeader}>
            <PaymentIcon size={20} color={colors.primary.main} strokeWidth={2} />
            <Text style={styles.paymentTitle}>{isMomo ? 'Mobile Money' : 'Bank Account'}</Text>
          </View>
          {isMomo ? (
            <>
              {details.sourceNetworkName ? (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{REVIEW_ROW_LABELS.paymentNetwork}</Text>
                  <Text style={styles.rowValue}>{details.sourceNetworkName}</Text>
                </View>
              ) : null}
              {details.sourcePhone ? (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{REVIEW_ROW_LABELS.mobileNumber}</Text>
                  <Text style={styles.rowValue}>{details.sourcePhone}</Text>
                </View>
              ) : null}
            </>
          ) : bankFields.length === 0 ? (
            <Text style={styles.notice}>
              Payment details unavailable. Contact support with reference {details.transactionId}.
            </Text>
          ) : (
            bankFields.map((field) => (
              <Pressable
                key={field.id}
                android_ripple={ripple.neutral}
                style={styles.row}
                onPress={() => void handleCopy(field.value, `yc-detail-${field.id}`)}
              >
                <Text style={styles.rowLabel}>{field.label}</Text>
                <View style={styles.copyRow}>
                  <Text style={styles.rowValue}>{field.value}</Text>
                  {copiedKey === `yc-detail-${field.id}` ? (
                    <Check size={16} color={colors.primary.main} />
                  ) : (
                    <Copy size={16} color={colors.text.secondary} />
                  )}
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </PremiumModalSheet>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
  title: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
    gap: spacing[4],
  },
  card: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  noticeBlock: {
    gap: spacing[2],
    paddingHorizontal: spacing[1],
  },
  notice: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  sendExactly: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    textAlign: 'center',
  },
  sendExactlyAmount: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  paymentTitle: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  rowLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    flexShrink: 0,
  },
  rowValue: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    fontFamily: 'monospace',
    textAlign: 'right',
    flexShrink: 1,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexShrink: 1,
    maxWidth: '62%',
  },
})
