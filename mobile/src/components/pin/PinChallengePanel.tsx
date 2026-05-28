import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable, Platform, Animated, ActivityIndicator } from 'react-native'
import { getLockoutState, verifyPin } from '../../lib/pinAuth'
import { appPinStrings } from '../../constants/app-pin-en'
import { colors, textStyles, borderRadius, spacing, useThemeColors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { PinDotsRow } from './PinDotsRow'
import { PinKeypad } from './PinKeypad'
import { PinLockedHintText } from './PinLockedHintText'
import { useDeferredLoading } from '../../hooks/useDeferredLoading'
import { haptics } from '../../lib/haptics'

export type PinChallengePanelProps = {
  /** When false, resets internal PIN state (same semantics as modal `visible`). */
  active: boolean
  userId: string
  onVerified: () => void
  /** Optional bottom action (e.g. modal dismiss). Omit on full-screen flows that use the nav header back affordance. */
  onCancel?: () => void
  cancelLabel?: string
  /** Hide centered title/subtitle (e.g. when the screen header already explains the step). */
  hideTitles?: boolean
}

/**
 * Shared PIN keypad + verification logic for {@link PinChallengeModal} and full-screen authorize flows.
 */
export function PinChallengePanel({
  active,
  userId,
  onVerified,
  onCancel,
  cancelLabel = appPinStrings.dialogCancel,
  hideTitles = false,
}: PinChallengePanelProps) {
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
    if (!active) {
      setPin('')
      setError(null)
      setBusy(false)
      lastTryRef.current = ''
      return
    }
    void refreshLock()
    const id = setInterval(() => void refreshLock(), 1000)
    return () => clearInterval(id)
  }, [active, refreshLock])

  useEffect(() => {
    if (pin.length === 0) lastTryRef.current = ''
  }, [pin])

  useEffect(() => {
    if (!active || pin.length !== 4 || busy || lockedOut) return
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
      haptics.error()
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
  }, [pin, active, busy, lockedOut, userId, shakeAnim])

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
    <View style={styles.wrap}>
      {!hideTitles ? (
        <>
          <Text style={styles.title}>{appPinStrings.dialogAuthorizeTitle}</Text>
          {!error && !lockedOut ? (
            <Text style={styles.subtitle}>{appPinStrings.dialogAuthorizeDesc}</Text>
          ) : null}
        </>
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
        <PinKeypad onDigit={onDigit} onBackspace={onBackspace} disabled={keypadDisabled} filledCount={filled} />
      )}

      {onCancel ? (
        <Pressable
          style={({ pressed }) => [
            styles.cancelBtn,
            pressed && Platform.OS === 'ios' && !busy && styles.cancelBtnPressedIOS,
          ]}
          onPress={onCancel}
          disabled={busy}
          android_ripple={ripple.neutral}
        >
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
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
