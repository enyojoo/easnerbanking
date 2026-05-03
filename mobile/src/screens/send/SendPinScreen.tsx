import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, ActivityIndicator } from 'react-native'
import Constants from 'expo-constants'
import { ArrowLeft } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { CommonActions } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { qk } from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import type { Recipient } from '../../types'
import { colors, surfaceChromeCircleStyle, textStyles, spacing, motion } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ToastProvider'
import { useQueryClient } from '@tanstack/react-query'
import { useScope } from '../../query/scope'
import { useBalance } from '../../contexts/BalanceContext'
import { analytics } from '../../lib/analytics'
import type { PricingQuote } from '../../lib/noahService'
import { executeBalanceSend } from '../../hooks/executeBalanceSend'
import { invalidateTransactionsFeed } from '../../query/refresh-user-feeds'
import { apiFetch } from '../../query/api-client'
import { PinChallengePanel } from '../../components/pin/PinChallengePanel'
import { resolveRecipientEasetagForUi } from '../../lib/easenetRecipientUi'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'

export default function SendPinScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { user, userProfile } = useAuth()
  const { showError, showInfo } = useToast()
  const qc = useQueryClient()
  const { scope } = useScope()
  const { updateBalanceOptimistically } = useBalance()

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
    reservedDebitEtid?: string
  }

  const recipient = params.recipient
  const calculatedTotalAmount = params.calculatedTotalAmount ?? 0
  const receiveAmountValue = params.receiveAmountValue ?? 0
  const selectedBalanceCurrency = params.selectedBalanceCurrency ?? 'USD'
  const pricingQuoteId = params.pricingQuoteId
  const pricingQuoteExpiry = params.pricingQuoteExpiry
  const pricingQuoteResult = params.pricingQuoteResult
  const reservedDebitEtid = params.reservedDebitEtid?.trim()

  const useLedger =
    Constants.expoConfig?.extra?.easetagLedgerP2pEnabled === true ||
    process.env.EXPO_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_EASETAG_LEDGER_P2P_ENABLED === 'true'

  useEffect(() => {
    analytics.trackScreenView('SendPin')
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
          ...(reservedDebitEtid ? { reservedDebitEtid } : {}),
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
      const txId = String(detailId ?? '').trim()
      if (!txId) {
        throw new Error('Transfer succeeded but no transaction reference was returned.')
      }

      // Warm React Query cache so TransactionDetails can show status/amounts immediately.
      if (scope) {
        try {
          await qc.prefetchQuery({
            queryKey: qk.transactions.detail(scope, txId),
            queryFn: () =>
              apiFetch<{ transaction?: unknown }>(`/api/transactions/${encodeURIComponent(txId)}`, {
                headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
              }),
          })
        } catch {
          // Ledger row may lag slightly; detail screen refetches.
        }
      }

      // Replace entire send stack with tabs + detail so back lands on Home, not Confirm/Send amount.
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            {
              name: 'TransactionDetails',
              params: { transactionId: txId, fromScreen: 'SendFlow' },
            },
          ],
        }),
      )

      if (scope && user?.id) {
        void invalidateTransactionsFeed(qc, scope, user.id).catch(() => {})
      }
    } catch (e: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      showError(e instanceof Error ? e.message : 'Transfer failed.')
    } finally {
      setBusy(false)
    }
  }

  const onVerified = () => {
    void runSend()
  }

  if (!recipient || !user?.id) {
    return (
      <ScreenWrapper>
        <View style={[styles.fallback, { paddingBottom: insets.bottom + spacing[4] }]}>
          <Text style={textStyles.body}>Nothing to authorize.</Text>
          <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing[4] }}>
            <Text style={{ color: colors.primary.main }}>Go back</Text>
          </Pressable>
        </View>
      </ScreenWrapper>
    )
  }

  const easetagUi = resolveRecipientEasetagForUi(recipient)
  const needReserve = Boolean(useLedger && easetagUi)
  const pinActive = !busy && !(needReserve && !reservedDebitEtid)

  return (
    <ScreenWrapper>
      <View style={[styles.root, { paddingBottom: insets.bottom + spacing[4] }]}>
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
          <Pressable
            android_ripple={ripple.neutral}
            onPress={() => {
              if (!busy) navigation.goBack()
            }}
            disabled={busy}
            style={[styles.backButton, busy && styles.backDisabled]}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Confirm with PIN</Text>
            <Text style={styles.subtitle}>Authorize this transfer from your balance</Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.content,
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
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {needReserve && !reservedDebitEtid ? (
              <Text style={styles.hint}>Missing transaction reference. Go back and try again.</Text>
            ) : busy ? (
              <View style={styles.sending}>
                <ActivityIndicator size="large" color={colors.primary.main} />
                <Text style={styles.sendingText}>Sending…</Text>
              </View>
            ) : (
              <PinChallengePanel
                active={pinActive}
                userId={user.id}
                onVerified={onVerified}
                hideTitles
              />
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    paddingHorizontal: spacing[5],
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  backDisabled: {
    opacity: 0.5,
  },
  headerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  subtitle: {
    marginTop: spacing[1],
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing[5],
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
    justifyContent: 'center',
  },
  hint: {
    ...textStyles.bodyMedium,
    color: colors.error.main,
    textAlign: 'center',
  },
  sending: {
    alignItems: 'center',
    paddingVertical: spacing[8],
    gap: spacing[3],
  },
  sendingText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
})
