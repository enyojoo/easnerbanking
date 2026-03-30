import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationProps } from '../../types'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import {
  setupPin,
  markFirstLoginAfterVerification,
  updateSessionActivity,
  setAppLocked,
} from '../../lib/pinAuth'
import { emitAppLocked } from '../../lib/app-lock-bus'
import { useAuth } from '../../contexts/AuthContext'
import { appPinStrings } from '../../constants/app-pin-en'

export default function PinSetupScreen({ navigation, route }: NavigationProps) {
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
        }, 300)
      }
    } else {
      setConfirmPin(newPin)
      if (filledCount === 3) {
        setTimeout(() => {
          handleConfirmPin(newPin.join(''))
        }, 300)
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
      // Fresh session + unlocked so idle re-check does not send user to PIN entry or sign-out
      await updateSessionActivity()
      if (uid) await setAppLocked(uid, false)

      if (uid && isMandatory) {
        markFirstLoginAfterVerification(uid).catch(() => {})
      }

      emitAppLocked()

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header - Help Icon */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => {
              Alert.alert(
                step === 'pin' ? appPinStrings.setupTitle : appPinStrings.confirmTitle,
                step === 'pin' ? appPinStrings.setupSubtitle : appPinStrings.confirmSubtitle,
              )
            }}
            activeOpacity={0.7}
          >
            <View style={styles.headerButtonCircle}>
              <Ionicons name="help-circle-outline" size={20} color={colors.text.primary} />
            </View>
          </TouchableOpacity>
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

          {/* PIN Dots - Light gray circles */}
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
                  disabled={loading}
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
                disabled={loading}
              >
                <Text style={styles.keypadButtonText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keypadButton}
                onPress={handleBackspace}
                onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                activeOpacity={0.6}
                disabled={loading || filledCount === 0}
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
          {!isMandatory && (
            <TouchableOpacity
              style={styles.logoutLink}
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
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.logoutText}>
                Not your account? <Text style={styles.logoutLinkText}>Log out</Text>
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

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
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  logoutLink: {
    alignItems: 'center',
    paddingBottom: spacing[6],
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
