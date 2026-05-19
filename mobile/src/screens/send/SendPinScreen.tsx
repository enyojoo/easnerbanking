import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationProps } from '../../types'
import type { Recipient } from '../../types'
import {
  colors,
  surfaceChromeCircleStyle,
  textStyles,
  spacing,
  fontFamily,
  useThemeColors,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useAuth } from '../../contexts/AuthContext'
import { analytics } from '../../lib/analytics'
import type { PricingQuote } from '../../lib/noahService'
import type { PayoutPrepareSession } from '../../hooks/executeBalanceSend'
import { appPinStrings } from '../../constants/app-pin-en'
import { getLockoutState, verifyPin } from '../../lib/pinAuth'
import { PinKeypad } from '../../components/pin'
import { PinLockedHintText } from '../../components/pin/PinLockedHintText'
import { markBalanceSendPinVerified } from '../../lib/sendFlowPostPinGate'

export default function SendPinScreen({ navigation, route }: NavigationProps) {
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [pin, setPin] = useState('')
  const [verifyingPin, setVerifyingPin] = useState(false)
  /** Spinner only after a short delay so fast success dismisses without flashing ActivityIndicator. */
  const [showVerifySpinner, setShowVerifySpinner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedOut, setLockedOut] = useState(false)
  const [lockMsRemaining, setLockMsRemaining] = useState(0)

  const lastTryRef = useRef('')
  const shakeAnim = useRef(new Animated.Value(0)).current
  const verifySpinnerDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    noahFee?: number
    easnerFee?: number
    calculatedTotalAmount?: number
    selectedBalanceCurrency?: string
    receiveCurrency?: string
    receiveAmountValue?: number
    payoutSession?: PayoutPrepareSession
  }

  const recipient = params.recipient
  const sendCur = params.selectedBalanceCurrency ?? 'USD'
  const showFeeSummary =
    (params.noahFee != null && params.noahFee > 0) ||
    (params.easnerFee != null && params.easnerFee > 0) ||
    (params.calculatedTotalAmount != null && params.calculatedTotalAmount > 0)

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const canVerifyPin = Boolean(recipient && user?.id) && !lockedOut

  const refreshLock = useCallback(async () => {
    if (!user?.id) return
    const s = await getLockoutState(user.id)
    setLockedOut(s.lockedOut)
    setLockMsRemaining(s.lockedOut ? Math.max(0, s.msRemaining) : 0)
  }, [user?.id])

  useEffect(() => {
    analytics.trackScreenView('SendPin')
  }, [])

  useEffect(() => {
    return () => {
      if (verifySpinnerDelayRef.current) {
        clearTimeout(verifySpinnerDelayRef.current)
        verifySpinnerDelayRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    void refreshLock()
    const id = setInterval(() => void refreshLock(), 1000)
    return () => clearInterval(id)
  }, [refreshLock, user?.id])

  useEffect(() => {
    if (pin.length === 0) lastTryRef.current = ''
  }, [pin])

  useEffect(() => {
    if (!canVerifyPin || pin.length !== 4 || verifyingPin) return
    if (!user?.id) return
    if (lastTryRef.current === pin) return
    lastTryRef.current = pin
    void (async () => {
      if (verifySpinnerDelayRef.current) {
        clearTimeout(verifySpinnerDelayRef.current)
        verifySpinnerDelayRef.current = null
      }
      setVerifyingPin(true)
      setShowVerifySpinner(false)
      verifySpinnerDelayRef.current = setTimeout(() => {
        verifySpinnerDelayRef.current = null
        setShowVerifySpinner(true)
      }, 220)
      setError(null)
      const res = await verifyPin(pin, user.id)
      if (verifySpinnerDelayRef.current) {
        clearTimeout(verifySpinnerDelayRef.current)
        verifySpinnerDelayRef.current = null
      }
      setShowVerifySpinner(false)
      setVerifyingPin(false)
      if (res.success) {
        setPin('')
        markBalanceSendPinVerified()
        navigation.goBack()
        return
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      if (res.locked) {
        setError(null)
        setLockedOut(true)
        if (res.lockedUntil) {
          setLockMsRemaining(Math.max(0, res.lockedUntil - Date.now()))
        }
      } else {
        setError(res.error || appPinStrings.lockIncorrect)
        setLockedOut(false)
      }
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start()
      setPin('')
    })()
  }, [pin, canVerifyPin, verifyingPin, user?.id, shakeAnim, navigation])

  const filledCount = pin.length
  const keypadDisabled = verifyingPin || lockedOut

  const onDigit = (d: string) => {
    if (keypadDisabled || pin.length >= 4) return
    setError(null)
    setPin((p) => p + d)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const onBackspace = () => {
    if (keypadDisabled || pin.length === 0) return
    setError(null)
    setPin((p) => p.slice(0, -1))
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  if (!recipient || !user?.id) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, spacing[3]) + spacing[2] },
        ]}
      >
        <View style={[styles.fallback, { paddingHorizontal: spacing[5] }]}>
          <Text style={textStyles.body}>Nothing to authorize.</Text>
          <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing[4] }}>
            <Text style={{ color: colors.primary.main }}>Go back</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const dotsFilled = Math.min(4, filledCount)
  const showDotsSpinner = verifyingPin && showVerifySpinner

  const hintContent = (() => {
    if (lockedOut) {
      return (
        <PinLockedHintText
          msRemaining={lockMsRemaining}
          prefixStyle={styles.errorText}
          digitsStyle={styles.errorText}
        />
      )
    }
    if (error) {
      return <Text style={styles.errorText}>{error}</Text>
    }
    return <Text style={styles.subtitle}>{appPinStrings.lockEnterPin}</Text>
  })()

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, spacing[3]) + spacing[2] },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Confirm with PIN</Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.topBlock}>
            {showFeeSummary ? (
              <View style={styles.feeSummary}>
                {params.receiveAmountValue != null && params.receiveCurrency ? (
                  <Text style={styles.feeLine}>
                    Recipient gets {fmt(params.receiveAmountValue)} {params.receiveCurrency}
                  </Text>
                ) : null}
                {params.noahFee != null && params.noahFee > 0 ? (
                  <Text style={styles.feeLine}>Noah fee {fmt(params.noahFee)} {sendCur}</Text>
                ) : null}
                {params.easnerFee != null && params.easnerFee > 0 ? (
                  <Text style={styles.feeLine}>Easner fee {fmt(params.easnerFee)} {sendCur}</Text>
                ) : null}
                {params.calculatedTotalAmount != null ? (
                  <Text style={styles.feeLineBold}>
                    Total debited {fmt(params.calculatedTotalAmount)} {sendCur}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.pinDotsWrapper}>
              {showDotsSpinner ? (
                <View style={styles.pinDotsLoadingOnly}>
                  <ActivityIndicator size="small" color={palette.primary.main} />
                </View>
              ) : (
                <Animated.View
                  style={[styles.pinDotsContainer, { transform: [{ translateX: shakeAnim }] }]}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.pinDot,
                        i < dotsFilled && styles.pinDotFilled,
                        Boolean(error) && styles.pinDotError,
                      ]}
                    />
                  ))}
                </Animated.View>
              )}
            </View>

            <View style={styles.hintSlot}>{hintContent}</View>
          </View>

          <View style={styles.keypadContainer}>
            <PinKeypad
              onDigit={onDigit}
              onBackspace={onBackspace}
              disabled={keypadDisabled}
              filledCount={filledCount}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.semantic.background,
  },
  keyboardView: {
    flex: 1,
  },
  /** Matches Send Amount / Send Confirm / recipient hub. */
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
  headerTitle: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
  },
  topBlock: {
    alignItems: 'center',
    width: '100%',
  },
  feeSummary: {
    width: '100%',
    marginBottom: spacing[4],
    paddingHorizontal: spacing[2],
  },
  feeLine: {
    ...textStyles.caption,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[1],
  },
  feeLineBold: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    textAlign: 'center',
    fontFamily: fontFamily.semibold,
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    width: '100%',
  },
  errorText: {
    ...textStyles.bodyMedium,
    color: colors.error.dark,
    textAlign: 'center',
    fontWeight: '600',
  },
  hintSlot: {
    width: '100%',
    minHeight: 48,
    marginTop: spacing[4],
    marginBottom: spacing[4],
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinDotsWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  pinDotsLoadingOnly: {
    minHeight: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[6],
    marginBottom: 0,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.background.secondary,
    borderWidth: 1.5,
    borderColor: colors.border.default,
  },
  pinDotFilled: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  pinDotError: {
    borderColor: colors.error.main,
  },
  keypadContainer: {
    width: '100%',
    marginTop: 'auto',
    marginBottom: spacing[4],
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
  },
})
