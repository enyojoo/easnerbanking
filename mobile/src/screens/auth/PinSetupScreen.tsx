import React, { useState } from 'react'
import { useDeferredLoading } from '../../hooks/useDeferredLoading'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { HelpCircle } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationProps } from '../../types'
import { colors, surfaceChromeCircleStyle, textStyles, spacing, useThemeColors } from '../../theme'
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
import { EasnerAlertSheet } from '../../components/premium'
import { useToast } from '../../components/ToastProvider'
import { haptics } from '../../lib/haptics'
import { AuthFlowContainer } from '../../components/layout/AuthFlowContainer'

export default function PinSetupScreen({ navigation, route }: NavigationProps) {
  const palette = useThemeColors()
  const { user, signOut } = useAuth()
  const { showError } = useToast()
  const [pin, setPin] = useState<string[]>(['', '', '', ''])
  const [confirmPin, setConfirmPin] = useState<string[]>(['', '', '', ''])
  const [step, setStep] = useState<'pin' | 'confirm'>('pin')
  const [loading, setLoading] = useState(false)
  const [mismatchSheetOpen, setMismatchSheetOpen] = useState(false)
  const [setupFailSheetOpen, setSetupFailSheetOpen] = useState(false)
  const [setupFailMessage, setSetupFailMessage] = useState('')
  const [helpSheetOpen, setHelpSheetOpen] = useState(false)
  const [logoutSheetOpen, setLogoutSheetOpen] = useState(false)
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
    
    haptics.tap()
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
    
    haptics.tap()
  }

  const handleConfirmPin = async (confirmPinString?: string) => {
    const pinString = pin.join('')
    const confirmPinStringFinal = confirmPinString || confirmPin.join('')

    if (pinString.length !== 4 || confirmPinStringFinal.length !== 4) {
      showError(appPinStrings.completePinPrompt)
      return
    }

    if (pinString !== confirmPinStringFinal) {
      setMismatchSheetOpen(true)
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

      haptics.success()

      // Optional flow: opened from main stack (e.g. More) – gate is already "main"
      if (!isMandatory) {
        navigation.goBack()
      }
    } else {
      setSetupFailMessage(result.error || appPinStrings.setupFailed)
      setSetupFailSheetOpen(true)
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
        <View style={styles.content}>
          <AuthFlowContainer>
          <View style={styles.helpRow}>
            <Pressable
              android_ripple={ripple.neutral}
              style={styles.headerButton}
              onPress={() => setHelpSheetOpen(true)}
            >
              <View style={styles.headerButtonCircle}>
                <HelpCircle size={20} color={palette.text.primary} strokeWidth={2} />
              </View>
            </Pressable>
          </View>

          <View style={styles.topBlock}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>
                {step === 'pin' ? appPinStrings.setupTitle : appPinStrings.confirmTitle}
              </Text>
            </View>

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

            <View style={styles.hintSlot}>
              <Text style={styles.subtitle}>
                {step === 'pin' ? appPinStrings.setupSubtitle : appPinStrings.confirmSubtitle}
              </Text>
            </View>
          </View>

          <View style={styles.keypadContainer}>
            <PinKeypad
              onDigit={handleNumberPress}
              onBackspace={handleBackspace}
              disabled={loading}
              filledCount={filledCount}
            />
          </View>

          {!isMandatory && (
            <Pressable
             android_ripple={ripple.neutral}
              style={[styles.logoutLink, { paddingBottom: spacing[4] }]}
              onPress={() => {
                setLogoutSheetOpen(true)
              }} >
              <Text style={styles.logoutText}>
                {appPinStrings.lockNotYourAccount}{' '}
                <Text style={styles.logoutLinkText}>{appPinStrings.lockLogOut}</Text>
              </Text>
            </Pressable>
          )}
          </AuthFlowContainer>
        </View>
      </KeyboardAvoidingView>

      <EasnerAlertSheet
        visible={mismatchSheetOpen}
        onDismiss={() => setMismatchSheetOpen(false)}
        title={appPinStrings.errorTitle}
        message={appPinStrings.mismatch}
        primaryLabel="OK"
        onPrimary={() => {
          setMismatchSheetOpen(false)
          setStep('pin')
          setPin(['', '', '', ''])
          setConfirmPin(['', '', '', ''])
        }}
        singleAction
      />
      <EasnerAlertSheet
        visible={setupFailSheetOpen}
        onDismiss={() => setSetupFailSheetOpen(false)}
        title={appPinStrings.errorTitle}
        message={setupFailMessage || appPinStrings.setupFailed}
        primaryLabel="OK"
        onPrimary={() => {
          setSetupFailSheetOpen(false)
          setStep('pin')
          setPin(['', '', '', ''])
          setConfirmPin(['', '', '', ''])
          setLoading(false)
        }}
        singleAction
      />
      <EasnerAlertSheet
        visible={helpSheetOpen}
        onDismiss={() => setHelpSheetOpen(false)}
        title={step === 'pin' ? appPinStrings.setupTitle : appPinStrings.confirmTitle}
        message={step === 'pin' ? appPinStrings.setupSubtitle : appPinStrings.confirmSubtitle}
        primaryLabel="OK"
        onPrimary={() => setHelpSheetOpen(false)}
        singleAction
      />
      <EasnerAlertSheet
        visible={logoutSheetOpen}
        onDismiss={() => setLogoutSheetOpen(false)}
        title="Log Out"
        message="Are you sure you want to log out?"
        primaryLabel="Log Out"
        onPrimary={() => {
          void (async () => {
            setLogoutSheetOpen(false)
            await signOut()
          })()
        }}
        secondaryLabel="Cancel"
        onSecondary={() => setLogoutSheetOpen(false)}
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
  titleBlock: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
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
