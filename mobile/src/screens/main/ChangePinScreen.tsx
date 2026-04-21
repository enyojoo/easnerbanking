import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationProps } from '../../types'
import { colors, textStyles, borderRadius, spacing, useThemeColors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useAuth } from '../../contexts/AuthContext'
import { hasPin, setupPin, verifyPin, getLockoutState } from '../../lib/pinAuth'
import { appPinStrings } from '../../constants/app-pin-en'
import { PinKeypad, PinLockedHintText } from '../../components/pin'

type Step = 'verify' | 'pin' | 'confirm'

const empty4 = (): string[] => ['', '', '', '']

export default function ChangePinScreen({ navigation }: NavigationProps) {
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState<Step>('verify')
  const [verifyDigits, setVerifyDigits] = useState<string[]>(empty4())
  const [pin, setPin] = useState<string[]>(empty4())
  const [confirmPin, setConfirmPin] = useState<string[]>(empty4())
  const [loading, setLoading] = useState(false)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedOut, setLockedOut] = useState(false)
  const [lockMsRemaining, setLockMsRemaining] = useState(0)
  const newPinRef = useRef('')
  const verifyTryRef = useRef('')
  const shakeAnim = useRef(new Animated.Value(0)).current

  const userId = user?.id

  const refreshLock = useCallback(async () => {
    if (!userId) return
    const s = await getLockoutState(userId)
    setLockedOut(s.lockedOut)
    setLockMsRemaining(s.lockedOut ? Math.max(0, s.msRemaining) : 0)
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void (async () => {
      const h = await hasPin(userId)
      if (!h) {
        Alert.alert(appPinStrings.errorTitle, appPinStrings.changePinNoPinMessage, [
          { text: appPinStrings.dialogCancel, style: 'cancel', onPress: () => navigation.goBack() },
          {
            text: appPinStrings.setupTitle,
            onPress: () => navigation.replace('PinSetup' as never, { mandatory: false } as never),
          },
        ])
        return
      }
      setReady(true)
    })()
  }, [userId, navigation])

  useEffect(() => {
    if (!ready || !userId) return
    void refreshLock()
    const id = setInterval(() => void refreshLock(), 1000)
    return () => clearInterval(id)
  }, [ready, userId, refreshLock])

  useEffect(() => {
    if (verifyDigits.every((d) => d === '')) verifyTryRef.current = ''
  }, [verifyDigits])

  const runShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start()
  }

  // Verify current PIN (auto-submit when 4 digits entered — same cadence as setup)
  useEffect(() => {
    if (!ready || !userId || step !== 'verify' || verifyBusy || lockedOut) return
    const code = verifyDigits.join('')
    if (code.length !== 4) return
    if (verifyTryRef.current === code) return
    verifyTryRef.current = code
    void (async () => {
      setVerifyBusy(true)
      setError(null)
      const res = await verifyPin(code, userId)
      setVerifyBusy(false)
      if (res.success) {
        setVerifyDigits(empty4())
        verifyTryRef.current = ''
        setStep('pin')
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        return
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      if (res.locked) {
        setError(null)
        setLockedOut(true)
      } else {
        setError(res.error || appPinStrings.lockIncorrect)
        setLockedOut(false)
      }
      runShake()
      setVerifyDigits(empty4())
      verifyTryRef.current = ''
    })()
  }, [ready, userId, step, verifyDigits, verifyBusy, lockedOut])

  const handleConfirmNewPin = async (confirmStr: string) => {
    const pinStr = newPinRef.current || pin.join('')
    if (pinStr.length !== 4 || confirmStr.length !== 4) {
      Alert.alert(appPinStrings.errorTitle, appPinStrings.completePinPrompt)
      return
    }
    if (pinStr !== confirmStr) {
      Alert.alert(appPinStrings.errorTitle, appPinStrings.mismatch, [
        {
          text: 'OK',
          onPress: () => {
            setStep('pin')
            setPin(empty4())
            setConfirmPin(empty4())
            newPinRef.current = ''
          },
        },
      ])
      return
    }
    setLoading(true)
    const res = await setupPin(pinStr, userId)
    setLoading(false)
    if (res.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(appPinStrings.changePinTitle, appPinStrings.changePinSuccessBody, [
        { text: appPinStrings.dialogConfirm, onPress: () => navigation.goBack() },
      ])
      return
    }
    Alert.alert(appPinStrings.errorTitle, res.error || appPinStrings.setupFailed, [
      {
        text: 'OK',
        onPress: () => {
          setStep('pin')
          setPin(empty4())
          setConfirmPin(empty4())
          newPinRef.current = ''
        },
      },
    ])
  }

  const handleNumberPress = (num: string) => {
    if (loading || verifyBusy || lockedOut) return

    if (step === 'verify') {
      const filled = verifyDigits.filter((d) => d !== '').length
      if (filled >= 4) return
      const next = [...verifyDigits]
      next[filled] = num
      setVerifyDigits(next)
      setError(null)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      return
    }

    const currentPin = step === 'pin' ? pin : confirmPin
    const filledCount = currentPin.filter((d) => d !== '').length
    if (filledCount >= 4) return

    const newPinArr = [...currentPin]
    newPinArr[filledCount] = num

    if (step === 'pin') {
      setPin(newPinArr)
      if (filledCount === 3) {
        setTimeout(() => {
          newPinRef.current = newPinArr.join('')
          setStep('confirm')
          setConfirmPin(empty4())
        }, 300)
      }
    } else {
      setConfirmPin(newPinArr)
      if (filledCount === 3) {
        setTimeout(() => {
          void handleConfirmNewPin(newPinArr.join(''))
        }, 300)
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleBackspace = () => {
    if (loading || verifyBusy || lockedOut) return

    if (step === 'verify') {
      const filled = verifyDigits.filter((d) => d !== '').length
      if (filled === 0) return
      const next = [...verifyDigits]
      next[filled - 1] = ''
      setVerifyDigits(next)
      setError(null)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      return
    }

    const currentPin = step === 'pin' ? pin : confirmPin
    const filledCount = currentPin.filter((d) => d !== '').length
    if (filledCount === 0) return
    const newPinArr = [...currentPin]
    newPinArr[filledCount - 1] = ''
    if (step === 'pin') setPin(newPinArr)
    else setConfirmPin(newPinArr)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleHeaderBack = () => {
    if (step === 'confirm') {
      setStep('pin')
      setConfirmPin(empty4())
      newPinRef.current = ''
      setError(null)
      return
    }
    if (step === 'pin') {
      setStep('verify')
      setPin(empty4())
      newPinRef.current = ''
      setError(null)
      return
    }
    navigation.goBack()
  }

  const helpTitle =
    step === 'verify'
      ? appPinStrings.settingsCurrentPin
      : step === 'pin'
        ? appPinStrings.settingsNewPin
        : appPinStrings.settingsConfirmNew

  const helpBody =
    step === 'verify'
      ? appPinStrings.dialogAuthorizeDesc
      : step === 'pin'
        ? appPinStrings.setupSubtitle
        : appPinStrings.confirmSubtitle

  const titleText =
    step === 'verify'
      ? appPinStrings.settingsCurrentPin
      : step === 'pin'
        ? appPinStrings.settingsNewPin
        : appPinStrings.settingsConfirmNew

  const currentPinDisplay = step === 'verify' ? verifyDigits : step === 'pin' ? pin : confirmPin
  const filledCount = currentPinDisplay.filter((d) => d !== '').length
  const showPinAreaSpinner = verifyBusy || loading

  if (!ready) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing[4] }]}>
        <View style={styles.loadingOnly}>
          <ActivityIndicator color={palette.primary.main} size="large" />
        </View>
      </View>
    )
  }

  const keypadDisabled = loading || verifyBusy || lockedOut

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing[4] }]}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable
           android_ripple={ripple.neutral}
            style={styles.headerButton}
            onPress={handleHeaderBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.headerButtonCircle}>
              <Ionicons name="arrow-back" size={20} color={palette.text.primary} />
            </View>
          </Pressable>
          <View style={styles.headerSpacer} />
          <Pressable
           android_ripple={ripple.neutral}
            style={styles.headerButton}
            onPress={() => Alert.alert(helpTitle, helpBody)} >
            <View style={styles.headerButtonCircle}>
              <Ionicons name="help-circle-outline" size={20} color={palette.text.primary} />
            </View>
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{titleText}</Text>
            <Text style={styles.subtitle}>{helpBody}</Text>
          </View>

          <View style={styles.pinDotsWrapper}>
            {showPinAreaSpinner ? (
              <View style={styles.pinDotsLoadingOnly}>
                <ActivityIndicator size="small" color={palette.primary.main} />
              </View>
            ) : (
              <Animated.View
                style={[
                  styles.pinDotsContainer,
                  error ? styles.pinDotsContainerWithHint : null,
                  { transform: [{ translateX: shakeAnim }] },
                ]}
              >
                {currentPinDisplay.map((digit, index) => (
                  <View
                    key={index}
                    style={[
                      styles.pinDot,
                      digit !== '' && styles.pinDotFilled,
                      !!error && styles.pinDotError,
                    ]}
                  />
                ))}
              </Animated.View>
            )}
          </View>

          {/* Same slot as PinEntryScreen hint: lock countdown OR incorrect PIN, never both */}
          {lockedOut || error ? (
            <View style={styles.hintSlot}>
              {lockedOut ? (
                <PinLockedHintText msRemaining={lockMsRemaining} prefixStyle={styles.hintSubtitle} />
              ) : (
                <Text style={styles.verifyErrorText}>{error}</Text>
              )}
            </View>
          ) : null}

          <View style={styles.keypadContainer}>
            <PinKeypad
              onDigit={handleNumberPress}
              onBackspace={handleBackspace}
              disabled={keypadDisabled}
              filledCount={filledCount}
              backspaceActiveColor={colors.error.main}
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
  loadingOnly: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  headerSpacer: {
    flex: 1,
  },
  headerButton: {
    padding: spacing[1],
  },
  headerButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[6],
    justifyContent: 'space-between',
  },
  titleBlock: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  title: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
    textAlign: 'center',
    width: '100%',
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    width: '100%',
  },
  pinDotsContainerWithHint: {
    marginBottom: 0,
  },
  pinDotsWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginBottom: spacing[16],
  },
  pinDotsLoadingOnly: {
    minHeight: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
  hintSubtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  verifyErrorText: {
    ...textStyles.bodyMedium,
    color: colors.error.dark,
    textAlign: 'center',
    fontWeight: '600',
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[4],
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
    marginBottom: spacing[8],
  },
})
