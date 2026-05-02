import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, ActivityIndicator } from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import type { Recipient } from '../../types'
import { colors, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ToastProvider'
import { useQueryClient } from '@tanstack/react-query'
import { useScope } from '../../query/scope'
import { useBalance } from '../../contexts/BalanceContext'
import { PinChallengeModal } from '../../components/pin'
import { useConfirmWithPin } from '../../hooks/useConfirmWithPin'
import { hasPin } from '../../lib/pinAuth'
import { analytics } from '../../lib/analytics'
import type { PricingQuote } from '../../lib/noahService'
import { executeBalanceSend } from '../../hooks/executeBalanceSend'
import { invalidateTransactionsFeed } from '../../query/refresh-user-feeds'

function fmtMoney(amount: number, currency: string): string {
  const sym =
    currency === 'USD'
      ? '$'
      : currency === 'EUR'
        ? '€'
        : currency === 'KES'
          ? 'KSh '
          : currency === 'GHS'
            ? '₵ '
            : ''
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function SendConfirmScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { user, userProfile } = useAuth()
  const { showError, showInfo } = useToast()
  const qc = useQueryClient()
  const { scope } = useScope()
  const { updateBalanceOptimistically } = useBalance()
  const { open: pinOpen, requestConfirm, onVerified, onOpenChange } = useConfirmWithPin()

  const [busy, setBusy] = useState(false)

  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current
  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  const params = route.params as {
    recipient?: Recipient
    calculatedSendingAmount?: number
    calculatedFeeAmount?: number
    calculatedTotalAmount?: number
    receiveAmountValue?: number
    selectedBalanceCurrency?: string
    receiveCurrency?: string
    pricingQuoteId?: string
    pricingQuoteExpiry?: string
    pricingQuoteResult?: PricingQuote | null
  }

  const recipient = params.recipient
  const calculatedSendingAmount = params.calculatedSendingAmount ?? 0
  const calculatedFeeAmount = params.calculatedFeeAmount ?? 0
  const calculatedTotalAmount = params.calculatedTotalAmount ?? 0
  const receiveAmountValue = params.receiveAmountValue ?? 0
  const selectedBalanceCurrency = params.selectedBalanceCurrency ?? 'USD'
  const receiveCurrency = params.receiveCurrency ?? recipient?.currency ?? ''
  const pricingQuoteId = params.pricingQuoteId
  const pricingQuoteExpiry = params.pricingQuoteExpiry
  const pricingQuoteResult = params.pricingQuoteResult

  useEffect(() => {
    analytics.trackScreenView('SendConfirm')
  }, [])

  const runSend = async () => {
    if (!recipient) {
      showError('Missing recipient.')
      return
    }
    setBusy(true)
    try {
      const { detailId } = await executeBalanceSend(
        {
          recipient,
          calculatedTotalAmount,
          receiveAmountValue,
          selectedBalanceCurrency,
          pricingQuoteId,
          pricingQuoteExpiry,
          pricingQuoteResult,
        },
        {
          userId: user?.id,
          userProfile,
          scope: scope ?? undefined,
          qc,
          updateBalanceOptimistically,
          showError,
          showInfo,
        },
      )
      if (scope && user?.id) {
        await invalidateTransactionsFeed(qc, scope, user.id)
      }
      navigation.replace('TransactionDetails' as never, {
        transactionId: detailId,
        fromScreen: 'SendFlow',
      } as never)
    } catch (e: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      showError(e instanceof Error ? e.message : 'Transfer failed.')
    } finally {
      setBusy(false)
    }
  }

  const onConfirmPress = async () => {
    if (!recipient || busy) return
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (!user?.id) {
      showError('Not authenticated.')
      return
    }
    if (!(await hasPin(user.id))) {
      showError('Set an app PIN in Settings before authorizing transfers.')
      return
    }
    const ok = await requestConfirm()
    if (!ok) return
    await runSend()
  }

  if (!recipient) {
    return (
      <ScreenWrapper>
        <View style={[styles.container, { paddingTop: insets.top + spacing[4] }]}>
          <Text style={textStyles.body}>Nothing to confirm.</Text>
          <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing[4] }}>
            <Text style={{ color: colors.primary.main }}>Go back</Text>
          </Pressable>
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <View style={[styles.container, { paddingTop: insets.top + spacing[2], paddingBottom: insets.bottom + spacing[4] }]}>
        <Animated.View
          style={[
            styles.header,
            {
              opacity: headerAnim,
              transform: [
                {
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-motion.screenEnterTranslateY, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable android_ripple={ripple.neutral} onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Review transfer</Text>
          <Text style={styles.subtitle}>Confirm before sending from your balance</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.contentWrap,
            {
              opacity: contentAnim,
              transform: [
                {
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [motion.screenEnterTranslateY, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <Row label="You send" value={`${fmtMoney(calculatedSendingAmount, selectedBalanceCurrency)} ${selectedBalanceCurrency}`} />
              <Row label="Fees" value={fmtMoney(calculatedFeeAmount, selectedBalanceCurrency)} />
              <Row label="Total debited" value={`${fmtMoney(calculatedTotalAmount, selectedBalanceCurrency)} ${selectedBalanceCurrency}`} bold />
              <Row label="Recipient gets" value={`${fmtMoney(receiveAmountValue, receiveCurrency)} ${receiveCurrency}`} />
              <Row label="To" value={recipient.full_name} last />
              {pricingQuoteExpiry ? (
                <Text style={styles.quoteHint}>Quote expires {new Date(pricingQuoteExpiry).toLocaleTimeString()}</Text>
              ) : null}
            </View>
          </ScrollView>
        </Animated.View>

        <Pressable
          android_ripple={ripple.neutral}
          style={[styles.cta, busy && styles.ctaDisabled]}
          onPress={() => void onConfirmPress()}
          disabled={busy}
        >
          <LinearGradient
            colors={busy ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Confirm and send</Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>

      <PinChallengeModal
        visible={pinOpen}
        userId={user?.id ?? ''}
        onClose={() => onOpenChange(false)}
        onVerified={onVerified}
      />
    </ScreenWrapper>
  )
}

function Row({ label, value, bold, last }: { label: string; value: string; bold?: boolean; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing[5],
  },
  header: {
    marginBottom: spacing[4],
  },
  contentWrap: {
    flex: 1,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: spacing[2],
    marginLeft: -spacing[2],
    marginBottom: spacing[2],
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 22,
    color: colors.text.primary,
  },
  subtitle: {
    marginTop: spacing[1],
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.secondary,
  },
  scrollContent: {
    paddingBottom: spacing[4],
  },
  card: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
    paddingBottom: spacing[3],
    marginBottom: spacing[3],
  },
  rowLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 0,
  },
  rowLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flexShrink: 0,
  },
  rowValue: {
    ...textStyles.body,
    color: colors.text.primary,
    textAlign: 'right',
    flex: 1,
  },
  rowValueBold: {
    fontFamily: fontFamily.semibold,
  },
  quoteHint: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    marginTop: spacing[2],
  },
  cta: {
    marginTop: spacing[2],
  },
  ctaDisabled: {
    opacity: 0.85,
  },
  ctaGradient: {
    borderRadius: borderRadius.full,
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaText: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    color: '#fff',
  },
})
