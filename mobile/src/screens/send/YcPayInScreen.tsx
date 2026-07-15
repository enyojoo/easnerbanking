import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { ArrowLeft, Check, Copy, Landmark } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useFixedFooterPadding, useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles, borderRadius, surfaceFrameStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { getCurrencySymbol } from '../../utils/formatters'
import { ycBankInfoFields } from '../../lib/yc-bank-info-fields'
import { haptics } from '../../lib/haptics'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'

type RouteParams = {
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

export default function YcPayInScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const footerPadding = useFixedFooterPadding(spacing[5])
  const copyToClipboard = useCopyToClipboard()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const params = (route.params || {}) as Partial<RouteParams>
  const {
    transactionId,
    sendCurrency = 'NGN',
    receiveAmount = 0,
    receiveCurrency = 'USD',
    recipientName = 'Recipient',
    transferId,
    localPayIn = 0,
    bankInfo,
    payInNotice,
  } = params

  const fields = ycBankInfoFields(bankInfo)
  const notice = payInNotice || 'Complete your transfer to send this payment.'

  const handleCopy = async (text: string, key: string) => {
    haptics.tap()
    await copyToClipboard(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  if (!transactionId || !transferId) {
    return (
      <ScreenWrapper>
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator color={colors.primary.main} />
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.backRow}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={20} color={colors.text.secondary} strokeWidth={2} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Complete payment</Text>
        <Text style={styles.subtitle}>
          Pay {getCurrencySymbol(sendCurrency)}
          {localPayIn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
          {sendCurrency} so {recipientName} receives {getCurrencySymbol(receiveCurrency)}
          {receiveAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
          {receiveCurrency}
        </Text>

        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>

        <View style={[styles.card, surfaceFrameStyle]}>
          <View style={styles.cardHeader}>
            <Landmark size={20} color={colors.primary.main} strokeWidth={2} />
            <Text style={styles.cardTitle}>Payment details</Text>
          </View>
          {fields.length === 0 ? (
            <Text style={styles.emptyFields}>
              Payment details unavailable. Contact support with reference {transactionId}.
            </Text>
          ) : (
            fields.map((f) => (
              <Pressable
                key={f.id}
                android_ripple={ripple.neutral}
                style={styles.fieldRow}
                onPress={() => void handleCopy(f.value, f.id)}
              >
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <View style={styles.fieldValueRow}>
                  <Text style={styles.fieldValue}>{f.value}</Text>
                  {copiedKey === f.id ? (
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

      <View style={[styles.footer, { paddingBottom: footerPadding }]}>
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.primaryButton}
          onPress={() => {
            navigation.navigate('TransactionDetails' as never, { transactionId } as never)
          }}
        >
          <Text style={styles.primaryButtonText}>I've made the payment</Text>
        </Pressable>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginBottom: spacing[4],
  },
  backText: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  title: {
    ...textStyles.screenTitle,
    marginBottom: spacing[2],
  },
  subtitle: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginBottom: spacing[4],
  },
  noticeBox: {
    backgroundColor: colors.background.muted,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
  },
  noticeText: {
    ...textStyles.body,
    color: colors.text.primary,
  },
  card: {
    padding: spacing[4],
    borderRadius: borderRadius.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  cardTitle: {
    ...textStyles.sectionTitle,
  },
  emptyFields: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  fieldRow: {
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
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
  footer: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
  },
  primaryButton: {
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  primaryButtonText: {
    ...textStyles.button,
    color: colors.text.onPrimary,
  },
})
