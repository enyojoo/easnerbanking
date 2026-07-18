import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import {
  verifyPin,
  getPinLockTimeRemaining,
  updateSessionActivity,
  setAppLocked,
  markWebPinSessionUnlocked,
} from '../lib/pinAuth'
import { emitAppLocked } from '../lib/app-lock-bus'
import { appPinStrings } from '../constants/app-pin-en'
import { displayFirstNameFromFullName, initialsFromFullName } from '../lib/userProfileHelpers'
import { useDeferredLoading } from '../hooks/useDeferredLoading'
import { PinKeypad, PinLockedHintText } from './pin'
import { AvatarImage } from './AvatarImage'
import { avatarImageUri } from '../lib/avatarCache'
import { haptics } from '../lib/haptics'
import {
  colors,
  textStyles,
  spacing,
  userAvatarStyles,
  useThemeColors,
} from '../theme'
import { ripple } from '../lib/androidRipple'
import { EasnerAlertSheet } from './premium'

type WebIdleLockOverlayProps = {
  visible: boolean
}

/**
 * Web-only idle soft-lock overlay. Keeps the main navigator mounted so screen
 * state and query cache survive unlock (business-style lightweight re-auth).
 */
export function WebIdleLockOverlay({ visible }: WebIdleLockOverlayProps) {
  const palette = useThemeColors()
  const { user, userProfile, signOut } = useAuth()
  const [pin, setPin] = useState<string[]>(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false)
  const [logoutSheetVisible, setLogoutSheetVisible] = useState(false)
  const shakeAnim = useRef(new Animated.Value(0)).current

  const displayFull =
    userProfile?.profile?.full_name ||
    [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ') ||
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.email ||
    ''

  const headerAvatarUri = avatarImageUri(userProfile?.profile?.avatar_url)

  useEffect(() => {
    if (!visible) {
      setPin(['', '', '', ''])
      setError('')
      setLoading(false)
    }
  }, [visible])

  useEffect(() => {
    setAvatarLoadFailed(false)
  }, [headerAvatarUri])

  const checkLockStatus = useCallback(async () => {
    const remaining = await getPinLockTimeRemaining()
    if (remaining > 0) {
      setLocked(true)
      setLockedUntil(Date.now() + remaining)
    } else {
      setLocked(false)
      setLockedUntil(null)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    void checkLockStatus()
    const interval = setInterval(() => {
      void checkLockStatus()
    }, 1000)
    return () => clearInterval(interval)
  }, [visible, checkLockStatus])

  const handleVerifyPin = async (pinString?: string) => {
    const pinToVerify = pinString || pin.join('')
    if (pinToVerify.length !== 4) return

    setLoading(true)
    setError('')

    const result = await verifyPin(pinToVerify, user?.id)

    if (result.success) {
      if (user?.id) {
        await setAppLocked(user.id, false)
        await updateSessionActivity()
        markWebPinSessionUnlocked(user.id)
        emitAppLocked('unlocked')
      }
      haptics.success()
      setLoading(false)
      return
    }

    haptics.error()
    setError(result.error || appPinStrings.lockIncorrect)
    setLocked(result.locked || false)
    setLockedUntil(result.lockedUntil || null)
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start()
    setPin(['', '', '', ''])
    setLoading(false)
  }

  const handleNumberPress = (num: string) => {
    if (loading || locked) return
    const filledCount = pin.filter((d) => d !== '').length
    if (filledCount >= 4) return

    setError('')
    const newPin = [...pin]
    newPin[filledCount] = num
    setPin(newPin)

    if (filledCount === 3) {
      setTimeout(() => {
        void handleVerifyPin(newPin.join(''))
      }, 80)
    }

    haptics.tap()
  }

  const handleBackspace = () => {
    if (loading || locked) return
    const filledCount = pin.filter((d) => d !== '').length
    if (filledCount === 0) return

    setError('')
    const newPin = [...pin]
    newPin[filledCount - 1] = ''
    setPin(newPin)
    haptics.tap()
  }

  const getUserName = () => {
    const full =
      userProfile?.profile?.full_name ||
      [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ') ||
      user?.full_name ||
      [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
      ''
    return displayFirstNameFromFullName(full, '')
  }

  const filledCount = pin.filter((d) => d !== '').length
  const showVerifySpinner = useDeferredLoading(loading && !error)

  if (Platform.OS !== 'web' || !visible) {
    return null
  }

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <View style={styles.panel}>
        <View style={styles.topBlock}>
          <View style={userAvatarStyles.pinEntryCircle}>
            {headerAvatarUri && !avatarLoadFailed ? (
              <AvatarImage
                avatarUrl={userProfile?.profile?.avatar_url}
                style={userAvatarStyles.image}
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <Text style={userAvatarStyles.pinEntryInitials}>{initialsFromFullName(displayFull)}</Text>
            )}
          </View>
          <View style={styles.greetingContainer}>
            <Text style={styles.greeting}>{appPinStrings.lockWelcome(getUserName())}</Text>
          </View>

          <View style={styles.pinDotsWrapper}>
            {showVerifySpinner ? (
              <View style={styles.pinDotsLoadingOnly}>
                <ActivityIndicator size="small" color={palette.primary.main} />
              </View>
            ) : (
              <Animated.View
                style={[styles.pinDotsContainer, { transform: [{ translateX: shakeAnim }] }]}
              >
                {pin.map((digit, index) => (
                  <View
                    key={index}
                    style={[
                      styles.pinDot,
                      digit !== '' && styles.pinDotFilled,
                      error ? styles.pinDotError : null,
                      locked ? styles.pinDotDisabled : null,
                    ]}
                  />
                ))}
              </Animated.View>
            )}
          </View>

          <View style={styles.hintSlot}>
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : locked && lockedUntil ? (
              <PinLockedHintText
                msRemaining={lockedUntil - Date.now()}
                prefixStyle={styles.errorText}
                digitsStyle={styles.errorText}
              />
            ) : (
              <Text style={styles.subtitle}>{appPinStrings.lockEnterPin}</Text>
            )}
          </View>
        </View>

        <View style={styles.keypadContainer}>
          <PinKeypad
            onDigit={handleNumberPress}
            onBackspace={handleBackspace}
            disabled={loading || locked}
            filledCount={filledCount}
          />
        </View>

        <Pressable
          android_ripple={ripple.neutral}
          style={styles.logoutLink}
          onPress={() => setLogoutSheetVisible(true)}
        >
          <Text style={styles.logoutText}>
            {appPinStrings.lockNotYourAccount}{' '}
            <Text style={styles.logoutLinkText}>{appPinStrings.lockLogOut}</Text>
          </Text>
        </Pressable>
      </View>

      <EasnerAlertSheet
        visible={logoutSheetVisible}
        onDismiss={() => setLogoutSheetVisible(false)}
        title={appPinStrings.logOutTitle}
        message={appPinStrings.logOutBody}
        primaryLabel={appPinStrings.lockLogOut}
        onPrimary={() => {
          void (async () => {
            setLogoutSheetVisible(false)
            await signOut()
          })()
        }}
        secondaryLabel={appPinStrings.dialogCancel}
        onSecondary={() => setLogoutSheetVisible(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[5],
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.semantic.background,
    borderRadius: 24,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[6],
    paddingBottom: spacing[4],
    ...Platform.select({
      web: {
        boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
      } as object,
      default: {},
    }),
  },
  topBlock: {
    alignItems: 'center',
    width: '100%',
  },
  greetingContainer: {
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  greeting: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    textAlign: 'center',
  },
  pinDotsWrapper: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  pinDotsLoadingOnly: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDotsContainer: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border.light,
    backgroundColor: colors.background.primary,
  },
  pinDotFilled: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  pinDotError: {
    borderColor: colors.error.main,
  },
  pinDotDisabled: {
    opacity: 0.5,
  },
  hintSlot: {
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    textAlign: 'center',
  },
  keypadContainer: {
    width: '100%',
    marginBottom: spacing[3],
  },
  logoutLink: {
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  logoutText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  logoutLinkText: {
    color: colors.primary.main,
    fontFamily: textStyles.bodySmall.fontFamily,
  },
})
