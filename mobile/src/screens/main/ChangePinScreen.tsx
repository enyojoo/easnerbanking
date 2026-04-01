import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { useAuth } from '../../contexts/AuthContext'
import { hasPin, setupPin, verifyPin, getLockoutState } from '../../lib/pinAuth'
import { appPinStrings } from '../../constants/app-pin-en'

type Step = 'verify' | 'pin' | 'confirm'

const empty4 = (): string[] => ['', '', '', '']

export default function ChangePinScreen({ navigation }: NavigationProps) {
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
  const [lockMinutes, setLockMinutes] = useState(0)
  const newPinRef = useRef('')
  const verifyTryRef = useRef('')
  const shakeAnim = useRef(new Animated.Value(0)).current

  const userId = user?.id

  const refreshLock = useCallback(async () => {
    if (!userId) return
    const s = await getLockoutState(userId)
    setLockedOut(s.lockedOut)
    setLockMinutes(s.lockedOut ? Math.max(1, Math.ceil(s.msRemaining / 60000)) : 0)
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
      setError(res.error || appPinStrings.lockIncorrect)
      setLockedOut(res.locked || false)
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

  const subtitleText =
    step === 'verify'
      ? appPinStrings.dialogAuthorizeDesc
      : step === 'pin'
        ? appPinStrings.setupSubtitle
        : appPinStrings.confirmSubtitle

  const currentPinDisplay = step === 'verify' ? verifyDigits : step === 'pin' ? pin : confirmPin
  const filledCount = currentPinDisplay.filter((d) => d !== '').length

  if (!ready) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing[4] }]}>
        <View style={styles.loadingOnly}>
          <ActivityIndicator color={colors.primary.main} size="large" />
        </View>
      </View>
    )
  }

  const keypadDisabled = loading || verifyBusy || lockedOut

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing[4] }]}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleHeaderBack}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.headerButtonCircle}>
              <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
            </View>
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => Alert.alert(helpTitle, helpBody)}
            activeOpacity={0.7}
          >
            <View style={styles.headerButtonCircle}>
              <Ionicons name="help-circle-outline" size={20} color={colors.text.primary} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{titleText}</Text>
            <Text style={styles.subtitle}>{subtitleText}</Text>
          </View>

          {lockedOut ? (
            <Text style={styles.lockout}>{appPinStrings.lockLockedTryMinutes(lockMinutes)}</Text>
          ) : null}

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

          {/* Same as PinEntryScreen: incorrect PIN is plain text below dots, not in a tinted box */}
          {error ? (
            <View style={styles.verifyHintSlot}>
              <Text style={styles.verifyErrorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.keypadContainer}>
            <View style={styles.keypadGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <TouchableOpacity
                  key={num}
                  style={styles.keypadButton}
                  onPress={() => handleNumberPress(num.toString())}
                  onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  activeOpacity={0.6}
                  disabled={keypadDisabled}
                >
                  <Text style={styles.keypadButtonText}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.keypadBottomRow}>
              <View style={styles.keypadButtonSpacer} />
              <TouchableOpacity
                style={styles.keypadButton}
                onPress={() => handleNumberPress('0')}
                onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                activeOpacity={0.6}
                disabled={keypadDisabled}
              >
                <Text style={styles.keypadButtonText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keypadButton}
                onPress={handleBackspace}
                onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                activeOpacity={0.6}
                disabled={keypadDisabled || filledCount === 0}
              >
                <Ionicons
                  name="backspace"
                  size={24}
                  color={filledCount === 0 ? colors.text.secondary : colors.error.main}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {verifyBusy ? (
        <View style={styles.loadingOverlay} pointerEvents="box-none">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.primary.main} />
            <Text style={styles.loadingLabel}>{appPinStrings.lockVerifying}</Text>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="box-none">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.primary.main} />
            <Text style={styles.loadingLabel}>{appPinStrings.pinSaving}</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
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
    marginBottom: spacing[8],
    gap: spacing[3],
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
    color: colors.text.primary,
    fontFamily: 'Outfit-Bold',
    fontWeight: '700',
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
  lockout: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  pinDotsContainerWithHint: {
    marginBottom: 0,
  },
  verifyHintSlot: {
    width: '100%',
    minHeight: 48,
    marginTop: spacing[6],
    marginBottom: spacing[16],
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: spacing[16],
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
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing[5],
    marginBottom: spacing[4],
  },
  keypadButton: {
    width: 80,
    height: 80,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  keypadButtonText: {
    fontSize: 28,
    lineHeight: 34,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    fontWeight: '600',
  },
  keypadBottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[5],
    paddingHorizontal: spacing[5],
  },
  keypadButtonSpacer: {
    width: 80,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingCard: {
    alignItems: 'center',
    gap: spacing[4],
  },
  loadingLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
})
