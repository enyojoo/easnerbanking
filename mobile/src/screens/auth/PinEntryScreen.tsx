import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native'
import { HelpCircle } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationProps } from '../../types'
import { colors, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, userAvatarStyles, useThemeColors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { verifyPin, getPinLockTimeRemaining, updateSessionActivity, setAppLocked } from '../../lib/pinAuth'
import { emitAppLocked } from '../../lib/app-lock-bus'
import { useAuth } from '../../contexts/AuthContext'
import { appPinStrings } from '../../constants/app-pin-en'
import { displayFirstNameFromFullName, initialsFromFullName } from '../../lib/userProfileHelpers'
import { useDeferredLoading } from '../../hooks/useDeferredLoading'
import { PinKeypad, PinLockedHintText } from '../../components/pin'
import { EasnerAlertSheet } from '../../components/premium'
import { AvatarImage } from '../../components/AvatarImage'
import { avatarImageUri, warmAvatarCache } from '../../lib/avatarCache'
import { haptics } from '../../lib/haptics'
import EaseEnter from '../../components/EaseEnter'
import { AuthFlowContainer } from '../../components/layout/AuthFlowContainer'
import { useScreenDecorativeEnter } from '../../hooks/useScreenDecorativeEnter'

export default function PinEntryScreen({ navigation: navigationProp }: NavigationProps) {
  const { shouldAnimateEnter } = useScreenDecorativeEnter()
  const palette = useThemeColors()
  const { user, userProfile, signOut } = useAuth()
  const [pin, setPin] = useState<string[]>(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false)
  const [forgotSheetVisible, setForgotSheetVisible] = useState(false)
  const [logoutSheetVisible, setLogoutSheetVisible] = useState(false)
  const shakeAnim = useRef(new Animated.Value(0)).current
  const insets = useSafeAreaInsets()

  const displayFull =
    userProfile?.profile?.full_name ||
    [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ') ||
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.email ||
    ''

  const headerAvatarUri = avatarImageUri(userProfile?.profile?.avatar_url)

  useEffect(() => {
    setAvatarLoadFailed(false)
  }, [headerAvatarUri])

  useEffect(() => {
    warmAvatarCache(headerAvatarUri)
  }, [headerAvatarUri])

  useEffect(() => {
    checkLockStatus()
    const interval = setInterval(checkLockStatus, 1000)
    return () => clearInterval(interval)
  }, [])

  const checkLockStatus = async () => {
    const remaining = await getPinLockTimeRemaining()
    if (remaining > 0) {
      setLocked(true)
      setLockedUntil(Date.now() + remaining)
    } else {
      setLocked(false)
      setLockedUntil(null)
    }
  }

  const handleNumberPress = (num: string) => {
    if (loading || locked) return
    
    const filledCount = pin.filter(d => d !== '').length
    
    if (filledCount >= 4) return

    setError('')
    const newPin = [...pin]
    newPin[filledCount] = num
    setPin(newPin)
    
    if (filledCount === 3) {
      setTimeout(() => {
        handleVerifyPin(newPin.join(''))
      }, 80)
    }
    
    haptics.tap()
  }

  const handleBackspace = () => {
    if (loading || locked) return
    
    const filledCount = pin.filter(d => d !== '').length
    
    if (filledCount === 0) return

    setError('')
    const newPin = [...pin]
    newPin[filledCount - 1] = ''
    setPin(newPin)
    
    haptics.tap()
  }

  const handleVerifyPin = async (pinString?: string) => {
    const pinToVerify = pinString || pin.join('')
    
    if (pinToVerify.length !== 4) {
      return
    }

    setLoading(true)
    setError('') // Clear any previous errors
    
    const result = await verifyPin(pinToVerify, user?.id)

    if (result.success) {
      if (user?.id) {
        await setAppLocked(user.id, false)
        await updateSessionActivity()
        emitAppLocked('unlocked')
      }

      haptics.success()
      setLoading(false)
    } else {
      haptics.error()
      setError(result.error || appPinStrings.lockIncorrect)
      setLocked(result.locked || false)
      setLockedUntil(result.lockedUntil || null)

      // Shake animation on error
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start()

      setPin(['', '', '', ''])
      setLoading(false) // Only set loading to false on error
    }
  }

  const handleForgotPin = () => {
    setForgotSheetVisible(true)
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

  const filledCount = pin.filter(d => d !== '').length
  const showVerifySpinner = useDeferredLoading(loading && !error)

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
        <View style={styles.content}>
          <AuthFlowContainer>
          <EaseEnter enabled={shouldAnimateEnter}>
          <View style={styles.helpRow}>
            <Pressable
              android_ripple={ripple.neutral}
              style={styles.headerButton}
              onPress={handleForgotPin}
            >
              <View style={styles.headerButtonCircle}>
                <HelpCircle size={20} color={palette.text.primary} strokeWidth={2} />
              </View>
            </Pressable>
          </View>

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

            {/* PIN dots, or centered spinner only while verifying (no dots under spinner) */}
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
                        error && styles.pinDotError,
                        locked && styles.pinDotDisabled,
                      ]}
                    />
                  ))}
                </Animated.View>
              )}
            </View>

            {/* Same line as “Enter your 4-digit PIN”: errors replace that hint here */}
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

          {/* Bottom Text */}
          <Pressable
           android_ripple={ripple.neutral}
            style={[styles.logoutLink, { paddingBottom: spacing[4] }]}
            onPress={() => {
              setLogoutSheetVisible(true)
            }} >
            <Text style={styles.logoutText}>
              {appPinStrings.lockNotYourAccount}{' '}
              <Text style={styles.logoutLinkText}>{appPinStrings.lockLogOut}</Text>
            </Text>
          </Pressable>
          </EaseEnter>
          </AuthFlowContainer>
        </View>
      </KeyboardAvoidingView>

      <EasnerAlertSheet
        visible={forgotSheetVisible}
        onDismiss={() => setForgotSheetVisible(false)}
        title={appPinStrings.forgotPinTitle}
        message={appPinStrings.forgotPinBody}
        primaryLabel={appPinStrings.forgotPinSignIn}
        onPrimary={() => {
          void (async () => {
            setForgotSheetVisible(false)
            await signOut()
          })()
        }}
        secondaryLabel={appPinStrings.dialogCancel}
        onSecondary={() => setForgotSheetVisible(false)}
      />
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
  container: {
    flex: 1,
    backgroundColor: colors.semantic.background,
  },
  keyboardView: {
    flex: 1,
  },
  helpRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  headerButton: {
    padding: spacing[1],
  },
  headerButtonCircle: {
    ...surfaceChromeCircleStyle(colors, 40),
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
  greetingContainer: {
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  greeting: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
    textAlign: 'center',
  },
  errorText: {
    ...textStyles.bodyMedium,
    color: colors.error.dark,
    textAlign: 'center',
    fontWeight: '600',
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
  hintSlot: {
    width: '100%',
    minHeight: 48,
    marginTop: spacing[4],
    marginBottom: spacing[4],
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
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
  pinDotDisabled: {
    opacity: 0.5,
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  keypadContainer: {
    width: '100%',
    marginTop: 'auto',
    marginBottom: spacing[4],
  },
  logoutLink: {
    alignItems: 'center',
  },
  logoutText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  logoutLinkText: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
})
