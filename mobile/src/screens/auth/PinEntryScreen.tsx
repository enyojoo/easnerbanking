import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationProps } from '../../types'
import { colors, textStyles, borderRadius, spacing, userAvatarStyles } from '../../theme'
import { verifyPin, getPinLockTimeRemaining, updateSessionActivity, setAppLocked } from '../../lib/pinAuth'
import { emitAppLocked } from '../../lib/app-lock-bus'
import { useAuth } from '../../contexts/AuthContext'
import { appPinStrings } from '../../constants/app-pin-en'
import { displayFirstNameFromFullName, initialsFromFullName } from '../../lib/userProfileHelpers'

export default function PinEntryScreen({ navigation: navigationProp }: NavigationProps) {
  const { user, userProfile, signOut } = useAuth()
  const [pin, setPin] = useState<string[]>(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false)
  const shakeAnim = useRef(new Animated.Value(0)).current
  const insets = useSafeAreaInsets()

  const displayFull =
    userProfile?.profile?.full_name ||
    [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ') ||
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.email ||
    ''

  const headerAvatarUrl =
    typeof userProfile?.profile?.avatar_url === 'string' && userProfile.profile.avatar_url.trim()
      ? userProfile.profile.avatar_url.trim()
      : null

  useEffect(() => {
    setAvatarLoadFailed(false)
  }, [headerAvatarUrl])

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
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleBackspace = () => {
    if (loading || locked) return
    
    const filledCount = pin.filter(d => d !== '').length
    
    if (filledCount === 0) return

    setError('')
    const newPin = [...pin]
    newPin[filledCount - 1] = ''
    setPin(newPin)
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
      
      // Haptic feedback (non-blocking, fire and forget)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      
      // Navigation happens immediately via triggerPinCheck
      // Loading state will clear when screen changes
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
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
    Alert.alert(appPinStrings.forgotPinTitle, appPinStrings.forgotPinBody, [
      { text: appPinStrings.dialogCancel, style: 'cancel' },
      {
        text: appPinStrings.forgotPinSignIn,
        onPress: async () => {
          await signOut()
        },
      },
    ])
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
        {/* Header - Help Icon */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleForgotPin}
            activeOpacity={0.7}
          >
            <View style={styles.headerButtonCircle}>
              <Ionicons name="help-circle-outline" size={20} color={colors.text.primary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.topBlock}>
            <View style={userAvatarStyles.pinEntryCircle}>
              {headerAvatarUrl && !avatarLoadFailed ? (
                <Image
                  source={{ uri: headerAvatarUrl }}
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
              {loading && !error ? (
                <View style={styles.pinDotsLoadingOnly}>
                  <ActivityIndicator size="small" color={colors.primary.main} />
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
              ) : (
                <Text style={styles.subtitle}>
                  {locked && lockedUntil
                    ? appPinStrings.lockLockedTryMinutes(
                        Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000)),
                      )
                    : appPinStrings.lockEnterPin}
                </Text>
              )}
            </View>
          </View>

          {/* Numeric Keypad - 3x3 grid + 0 and backspace */}
          <View style={styles.keypadContainer}>
            {/* Numbers 1-9 in 3x3 grid */}
            <View style={styles.keypadGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <TouchableOpacity
                  key={num}
                  style={styles.keypadButton}
                  onPress={() => handleNumberPress(num.toString())}
                  onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  activeOpacity={0.6}
                  disabled={loading || locked}
                >
                  <Text style={styles.keypadButtonText}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Bottom row: 0 in center, backspace on right */}
            <View style={styles.keypadBottomRow}>
              <View style={styles.keypadButtonSpacer} />
              <TouchableOpacity
                style={styles.keypadButton}
                onPress={() => handleNumberPress('0')}
                onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                activeOpacity={0.6}
                disabled={loading || locked}
              >
                <Text style={styles.keypadButtonText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keypadButton}
                onPress={handleBackspace}
                onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                activeOpacity={0.6}
                disabled={loading || locked || filledCount === 0}
              >
                <Ionicons 
                  name="backspace" 
                  size={24} 
                  color={filledCount === 0 ? colors.text.secondary : colors.text.primary} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom Text */}
          <TouchableOpacity
            style={[styles.logoutLink, { paddingBottom: spacing[4] }]}
            onPress={() => {
              Alert.alert(appPinStrings.logOutTitle, appPinStrings.logOutBody, [
                { text: appPinStrings.dialogCancel, style: 'cancel' },
                {
                  text: appPinStrings.lockLogOut,
                  style: 'destructive',
                  onPress: async () => {
                    await signOut()
                  },
                },
              ])
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.logoutText}>
              {appPinStrings.lockNotYourAccount}{' '}
              <Text style={styles.logoutLinkText}>{appPinStrings.lockLogOut}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
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
    fontSize: 32,
    lineHeight: 40,
    color: colors.text.primary,
    fontFamily: 'Outfit-Bold',
    fontWeight: '700',
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
  logoutLink: {
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
  },
  logoutLinkText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.primary,
    textDecorationLine: 'underline',
    fontFamily: 'Outfit-SemiBold',
    fontWeight: '600',
  },
})
