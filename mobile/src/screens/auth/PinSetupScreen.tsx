import React, { useState } from 'react'
import { useDeferredLoading } from '../../hooks/useDeferredLoading'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationProps } from '../../types'
import { colors, textStyles, borderRadius, spacing, useThemeColors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import {
  setupPin,
  markFirstLoginAfterVerification,
  updateSessionActivity,
  setAppLocked,
  skipColdStartPinLockForUser,
} from '../../lib/pinAuth'
import { emitAppLocked } from '../../lib/app-lock-bus'
import { useAuth } from '../../contexts/AuthContext'
import { appPinStrings } from '../../constants/app-pin-en'
import { PinKeypad } from '../../components/pin'

export default function PinSetupScreen({ navigation, route }: NavigationProps) {
  const palette = useThemeColors()
  const { user, signOut } = useAuth()
  const [pin, setPin] = useState<string[]>(['', '', '', ''])
  const [confirmPin, setConfirmPin] = useState<string[]>(['', '', '', ''])
  const [step, setStep] = useState<'pin' | 'confirm'>('pin')
  const [loading, setLoading] = useState(false)
  const insets = useSafeAreaInsets()
  const isMandatory = route?.params?.mandatory || false

  const handleNumberPress = (num: string) => {
    if (loading) return
    
    const currentPin = step === 'pin' ? pin : confirmPin
    const filledCount = currentPin.filter(d => d !== '').length
    
    if (filledCount >= 4) return

    const newPin = [...currentPin]
    newPin[filledCount] = num
    
    if (step === 'pin') {
      setPin(newPin)
      if (filledCount === 3) {
        setTimeout(() => {
          setStep('confirm')
          setConfirmPin(['', '', '', ''])
        }, 80)
      }
    } else {
      setConfirmPin(newPin)
      if (filledCount === 3) {
        setTimeout(() => {
          handleConfirmPin(newPin.join(''))
        }, 80)
      }
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleBackspace = () => {
    if (loading) return
    
    const currentPin = step === 'pin' ? pin : confirmPin
    const filledCount = currentPin.filter(d => d !== '').length
    
    if (filledCount === 0) return

    const newPin = [...currentPin]
    newPin[filledCount - 1] = ''
    
    if (step === 'pin') {
      setPin(newPin)
    } else {
      setConfirmPin(newPin)
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleConfirmPin = async (confirmPinString?: string) => {
    const pinString = pin.join('')
    const confirmPinStringFinal = confirmPinString || confirmPin.join('')

    if (pinString.length !== 4 || confirmPinStringFinal.length !== 4) {
      Alert.alert(appPinStrings.errorTitle, appPinStrings.completePinPrompt)
      return
    }

    if (pinString !== confirmPinStringFinal) {
      Alert.alert(appPinStrings.errorTitle, appPinStrings.mismatch, [
        {
          text: 'OK',
          onPress: () => {
            // Reset to first step - Create PIN
            setStep('pin')
            setPin(['', '', '', ''])
            setConfirmPin(['', '', '', ''])
          },
        },
      ])
      return
    }

    setLoading(true)
    const result = await setupPin(pinString, user?.id)

    if (result.success) {
      const uid = user?.id
      if (uid) skipColdStartPinLockForUser(uid)
      // Fresh session + unlocked so idle re-check does not send user to PIN entry or sign-out
      await updateSessionActivity()
      if (uid) await setAppLocked(uid, false)

      if (uid && isMandatory) {
        markFirstLoginAfterVerification(uid).catch(() => {})
      }

      emitAppLocked('unlocked')

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})

      // Optional flow: opened from main stack (e.g. More) — gate is already "main"
      if (!isMandatory) {
        navigation.goBack()
      }
    } else {
      Alert.alert(appPinStrings.errorTitle, result.error || appPinStrings.setupFailed, [
        {
          text: 'OK',
          onPress: () => {
            // Reset to first step on error
            setStep('pin')
            setPin(['', '', '', ''])
            setConfirmPin(['', '', '', ''])
            setLoading(false)
          },
        },
      ])
    }
  }

  const handleBack = () => {
    if (isMandatory) {
      if (step === 'confirm') {
        setStep('pin')
        setConfirmPin(['', '', '', ''])
      }
    } else {
      if (step === 'confirm') {
        setStep('pin')
        setConfirmPin(['', '', '', ''])
      } else {
        navigation.goBack()
      }
    }
  }

  const currentPin = step === 'pin' ? pin : confirmPin
  const filledCount = currentPin.filter(d => d !== '').length
  const showSaveSpinner = useDeferredLoading(loading)

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
          <Pressable
           android_ripple={ripple.neutral}
            style={styles.headerButton}
            onPress={() => {
              Alert.alert(
                step === 'pin' ? appPinStrings.setupTitle : appPinStrings.confirmTitle,
                step === 'pin' ? appPinStrings.setupSubtitle : appPinStrings.confirmSubtitle,
              )
            }} >
            <View style={styles.headerButtonCircle}>
              <Ionicons name="help-circle-outline" size={20} color={palette.text.primary} />
            </View>
          </Pressable>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>
              {step === 'pin' ? appPinStrings.setupTitle : appPinStrings.confirmTitle}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'pin' ? appPinStrings.setupSubtitle : appPinStrings.confirmSubtitle}
            </Text>
          </View>

          {/* PIN dots, or centered spinner while saving */}
          <View style={styles.pinDotsWrapper}>
            {showSaveSpinner ? (
              <View style={styles.pinDotsLoadingOnly}>
                <ActivityIndicator size="small" color={palette.primary.main} />
              </View>
            ) : (
              <View style={styles.pinDotsContainer}>
                {currentPin.map((digit, index) => (
                  <View
                    key={index}
                    style={[
                      styles.pinDot,
                      digit !== '' && styles.pinDotFilled,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>

          <View style={styles.keypadContainer}>
            <PinKeypad
              onDigit={handleNumberPress}
              onBackspace={handleBackspace}
              disabled={loading}
              filledCount={filledCount}
            />
          </View>

          {/* Bottom Text */}
          {!isMandatory && (
            <Pressable
             android_ripple={ripple.neutral}
              style={[styles.logoutLink, { paddingBottom: spacing[4] }]}
              onPress={() => {
                Alert.alert(
                  'Log Out',
                  'Are you sure you want to log out?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Log Out',
                      style: 'destructive',
                      onPress: async () => {
                        // Call signOut to properly clear session and navigate
                        await signOut()
                      },
                    },
                  ]
                )
              }} >
              <Text style={styles.logoutText}>
                Not your account? <Text style={styles.logoutLinkText}>Log out</Text>
              </Text>
            </Pressable>
          )}
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
    justifyContent: 'space-between',
  },
  titleBlock: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
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
  pinDotsWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginBottom: spacing[6],
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
    gap: spacing[4],
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
  keypadContainer: {
    width: '100%',
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
