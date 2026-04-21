import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { getLockoutState, verifyPin } from '../../lib/pinAuth'
import { appPinStrings } from '../../constants/app-pin-en'
import { colors, textStyles, borderRadius, spacing, useThemeColors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { PinDotsRow } from './PinDotsRow'
import { PinKeypad } from './PinKeypad'
import { PinLockedHintText } from './PinLockedHintText'
import { useDeferredLoading } from '../../hooks/useDeferredLoading'

type Props = {
  visible: boolean
  userId: string
  onClose: () => void
  /** Called after PIN verified (caller should close modal). */
  onVerified: () => void
}

/**
 * Modal PIN challenge for sensitive actions (e.g. confirm send). Same keypad/dots/shake as unlock.
 */
export function PinChallengeModal({ visible, userId, onClose, onVerified }: Props) {
  const palette = useThemeColors()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedOut, setLockedOut] = useState(false)
  const [lockMsRemaining, setLockMsRemaining] = useState(0)
  const lastTryRef = useRef('')
  const onVerifiedRef = useRef(onVerified)
  onVerifiedRef.current = onVerified
  const shakeAnim = useRef(new Animated.Value(0)).current

  const refreshLock = useCallback(async () => {
    const s = await getLockoutState(userId)
    setLockedOut(s.lockedOut)
    setLockMsRemaining(s.lockedOut ? Math.max(0, s.msRemaining) : 0)
  }, [userId])

  useEffect(() => {
    if (!visible) {
      setPin('')
      setError(null)
      setBusy(false)
      lastTryRef.current = ''
      return
    }
    void refreshLock()
    const id = setInterval(() => void refreshLock(), 1000)
    return () => clearInterval(id)
  }, [visible, refreshLock])

  useEffect(() => {
    if (pin.length === 0) lastTryRef.current = ''
  }, [pin])

  useEffect(() => {
    if (!visible || pin.length !== 4 || busy || lockedOut) return
    if (lastTryRef.current === pin) return
    lastTryRef.current = pin
    void (async () => {
      setBusy(true)
      setError(null)
      const res = await verifyPin(pin, userId)
      setBusy(false)
      if (res.success) {
        setPin('')
        onVerifiedRef.current()
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
  }, [pin, visible, busy, lockedOut, userId, shakeAnim])

  const filled = pin.length
  const keypadDisabled = busy || lockedOut
  const showBusySpinner = useDeferredLoading(busy && !error)

  const onDigit = (d: string) => {
    if (keypadDisabled || pin.length >= 4) return
    setError(null)
    setPin((p) => p + d)
  }

  const onBackspace = () => {
    if (keypadDisabled || pin.length === 0) return
    setError(null)
    setPin((p) => p.slice(0, -1))
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{appPinStrings.dialogAuthorizeTitle}</Text>
          {!error && !lockedOut ? (
            <Text style={styles.subtitle}>{appPinStrings.dialogAuthorizeDesc}</Text>
          ) : null}

          {lockedOut ? (
            <View style={styles.lockoutWrap}>
              <PinLockedHintText
                msRemaining={lockMsRemaining}
                prefixStyle={styles.lockout}
                digitsStyle={styles.lockout}
              />
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <PinDotsRow
            filledLength={filled}
            hasError={!!error}
            disabled={keypadDisabled}
            shakeStyle={{ transform: [{ translateX: shakeAnim }] }}
          />

          {showBusySpinner ? (
            <View style={styles.busy}>
              <ActivityIndicator size="small" color={palette.primary.main} />
            </View>
          ) : (
            <PinKeypad
              onDigit={onDigit}
              onBackspace={onBackspace}
              disabled={keypadDisabled}
              filledCount={filled}
            />
          )}

          <Pressable
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && Platform.OS === 'ios' && !busy && styles.cancelBtnPressedIOS,
            ]}
            onPress={onClose}
            disabled={busy}
            android_ripple={ripple.neutral}
          >
            <Text style={styles.cancelText}>{appPinStrings.dialogCancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: colors.semantic.background,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
  },
  title: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  lockoutWrap: {
    width: '100%',
    marginBottom: spacing[3],
    alignItems: 'center',
  },
  lockout: {
    ...textStyles.bodyMedium,
    color: colors.error.dark,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorText: {
    ...textStyles.bodyMedium,
    color: colors.error.dark,
    textAlign: 'center',
    fontWeight: '600',
    width: '100%',
    marginBottom: spacing[3],
    paddingHorizontal: spacing[1],
  },
  busy: {
    alignItems: 'center',
    paddingVertical: spacing[4],
  },
  cancelBtn: {
    marginTop: spacing[4],
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  cancelBtnPressedIOS: {
    opacity: 0.7,
  },
  cancelText: {
    ...textStyles.bodyMedium,
    color: colors.primary.main,
  },
})
