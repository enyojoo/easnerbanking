import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, ActivityIndicator } from 'react-native'
import { ArrowLeft, Copy, Check } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import QRCode from 'react-native-qrcode-svg'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import type { Recipient } from '../../types'
import { colors, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion, fontFamily } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { analytics } from '../../lib/analytics'
import { getApiBaseUrl, getNoahScopeHeaders } from '../../lib/apiClient'
import { supabase } from '../../lib/supabase'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'

function stablecoinLabel(pm: string | undefined): string {
  const u = String(pm || '').toUpperCase()
  if (u === 'USDC' || u === 'USDT') return u
  return 'USDC'
}

export default function StablecoinScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const copyToClipboard = useCopyToClipboard()
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current
  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  const params = route.params as {
    transactionId?: string
    sendAmount?: number
    receiveAmount?: number
    sendCurrency?: string
    receiveCurrency?: string
    recipient?: Recipient
    feeAmount?: number
    totalAmount?: number
    paymentMethod?: string
  }

  const transactionId = params.transactionId ?? ''
  const sendAmount = params.sendAmount ?? 0
  const receiveAmount = params.receiveAmount ?? 0
  const receiveCurrency = params.receiveCurrency ?? ''
  const recipient = params.recipient
  const paymentMethod = params.paymentMethod
  const stableType = stablecoinLabel(paymentMethod)

  const [address, setAddress] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    analytics.trackScreenView('StablecoinSend')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadError(null)
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        if (!token) throw new Error('Not authenticated')
        const scopeHeaders = await getNoahScopeHeaders()
        const res = await fetch(`${getApiBaseUrl()}/api/noah/wallets`, {
          headers: { Authorization: `Bearer ${token}`, ...scopeHeaders },
        })
        const data = (await res.json().catch(() => ({}))) as { wallets?: Array<{ address?: string }>; error?: string }
        if (!res.ok) throw new Error(data.error || 'Could not load wallet')
        const addr = data.wallets?.[0]?.address?.trim()
        if (!addr) throw new Error('No deposit address found')
        if (!cancelled) setAddress(addr)
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load wallet')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onCopyAddress = async () => {
    if (!address) return
    const ok = await copyToClipboard(address)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
  }

  const onContinue = () => {
    if (!transactionId) return
    navigation.replace('TransactionDetails' as never, {
      transactionId,
      fromScreen: 'SendFlow',
    } as never)
  }

  return (
    <ScreenWrapper>
      <View style={[styles.container, { paddingBottom: insets.bottom + spacing[4] }]}>
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
          <View style={styles.headerContent}>
            <Text style={styles.title}>Pay with {stableType}</Text>
            <Text style={styles.subtitle}>Send on-chain to your Easner deposit address</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.main, { opacity: contentAnim }]}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {loadError ? (
              <Text style={styles.error}>{loadError}</Text>
            ) : !address ? (
              <ActivityIndicator size="large" color={colors.primary.main} style={{ marginTop: spacing[8] }} />
            ) : (
              <>
                <View style={styles.card}>
                  <Text style={styles.monoSmall}>{transactionId}</Text>
                  <Row label="You send" value={`${sendAmount.toFixed(2)} ${stableType}`} />
                  <Row label="Recipient gets" value={`${receiveAmount.toFixed(2)} ${receiveCurrency}`} last />
                  <Text style={styles.recipientName}>{recipient?.full_name ?? '—'}</Text>
                </View>

                <View style={styles.qrWrap}>
                  <QRCode value={address} size={200} />
                </View>

                <Pressable android_ripple={ripple.neutral} style={styles.copyRow} onPress={() => void onCopyAddress()}>
                  <Text style={styles.addressText} numberOfLines={2}>
                    {address}
                  </Text>
                  {copied ? <Check size={20} color={colors.primary.main} /> : <Copy size={20} color={colors.primary.main} />}
                </Pressable>

                <Text style={styles.networkHint}>Network: Solana (matches Easner wallet funding)</Text>
              </>
            )}
          </ScrollView>
        </Animated.View>

        <Pressable
          android_ripple={ripple.neutral}
          style={[styles.cta, (!address || !transactionId) && styles.ctaDisabled]}
          onPress={onContinue}
          disabled={!address || !transactionId}
        >
          <Text style={styles.ctaText}>View transaction status</Text>
        </Pressable>
      </View>
    </ScreenWrapper>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  main: {
    flex: 1,
    paddingHorizontal: spacing[5],
  },
  scroll: {
    paddingBottom: spacing[6],
  },
  card: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
  },
  monoSmall: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    marginBottom: spacing[3],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
    paddingBottom: spacing[3],
    marginBottom: spacing[3],
  },
  rowLast: {
    borderBottomWidth: 0,
    marginBottom: spacing[2],
    paddingBottom: 0,
  },
  rowLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  rowValue: {
    ...textStyles.body,
    fontFamily: fontFamily.semibold,
    color: colors.text.primary,
  },
  recipientName: {
    ...textStyles.body,
    color: colors.text.primary,
  },
  qrWrap: {
    alignItems: 'center',
    padding: spacing[4],
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    alignSelf: 'center',
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[4],
    padding: spacing[3],
    backgroundColor: colors.semantic.muted,
    borderRadius: borderRadius.md,
  },
  addressText: {
    flex: 1,
    ...textStyles.caption,
    color: colors.text.primary,
  },
  networkHint: {
    marginTop: spacing[3],
    ...textStyles.caption,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  error: {
    color: colors.error.main,
    ...textStyles.body,
    marginTop: spacing[4],
  },
  cta: {
    marginTop: spacing[2],
    marginHorizontal: spacing[5],
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.full,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    color: colors.text.inverse,
  },
})
