import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  BackHandler,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ExternalLinkModal from '../../components/ExternalLinkModal'
import { TextField } from '../../components/ui'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'
import { GoogleOutlineButton, OrDivider } from '../../components/auth/AuthChrome'
import { useExternalLink } from '../../hooks/useExternalLink'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { colors, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { AUTH_INITIAL_MODE_KEY, TERMS_URL } from '../../constants/auth'
import { PinKeypad } from '../../components/pin'
import { ActivityIndicator } from 'react-native'
import { useOtpClipboardAutofill } from '../../hooks/useOtpClipboardAutofill'

/**
 * Layout mirrors business auth pages:
 * - /auth/layout: logo centered, then card (max-w-md)
 * - /auth/login: Google → Or → email/password → forgot → Sign in → footer
 * - /auth/signup: terms → Google → Or → name/email/password → Create account → footer
 * Mobile switches login/signup via footer links (separate routes on web).
 * Form content sits on the page background — no inset card frame (unlike web’s bordered card).
 */
type AuthMode = 'login' | 'signup'
type SignupStep = 'form' | 'otp'

const FROM_ONBOARDING_KEY = '@easner_from_onboarding'

export default function AuthScreen({ navigation }: NavigationProps) {
  /** Stack of auth modes so Back pops login ↔ signup before leaving for onboarding. */
  const [modeStack, setModeStack] = useState<AuthMode[]>(['login'])
  const [fromOnboarding, setFromOnboarding] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { signIn, signInWithGoogle, resendSignupOtp, signUp, verifySignupOtp } = useAuth()
  const [signupStep, setSignupStep] = useState<SignupStep>('form')
  const [signupOtp, setSignupOtp] = useState('')
  const [signupOtpError, setSignupOtpError] = useState('')
  const [signupOtpNotice, setSignupOtpNotice] = useState('')
  const [signupResendCooldown, setSignupResendCooldown] = useState(0)

  const mode = modeStack[modeStack.length - 1]!
  const showBackButton = modeStack.length > 1 || fromOnboarding
  const insets = useSafeAreaInsets()
  const termsLink = useExternalLink()

  useEffect(() => {
    const checkFromOnboarding = async () => {
      try {
        const fromFlag = await AsyncStorage.getItem(FROM_ONBOARDING_KEY)
        if (fromFlag === 'true') {
          setFromOnboarding(true)
        }
        const initialMode = await AsyncStorage.getItem(AUTH_INITIAL_MODE_KEY)
        if (initialMode === 'signup') {
          setModeStack(['signup'])
          await AsyncStorage.removeItem(AUTH_INITIAL_MODE_KEY)
        }
      } catch (error) {
        console.error('Error checking from onboarding:', error)
      }
    }
    checkFromOnboarding()
  }, [])

  useEffect(() => {
    analytics.trackScreenView(mode === 'login' ? 'Login' : 'Register')
  }, [mode])

  const switchMode = async (newMode: AuthMode) => {
    if (newMode === mode) return
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setModeStack((prev) => [...prev, newMode])
    setEmail('')
    setPassword('')
    setFullName('')
    setSignupStep('form')
    setSignupOtp('')
    setSignupOtpError('')
    setSignupOtpNotice('')
    setSignupResendCooldown(0)
  }

  const handleBack = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (modeStack.length > 1) {
      setEmail('')
      setPassword('')
      setFullName('')
      setPasswordVisible(false)
      setSignupStep('form')
      setSignupOtp('')
      setSignupOtpError('')
      setSignupOtpNotice('')
      setSignupResendCooldown(0)
      setModeStack((prev) => prev.slice(0, -1))
      return
    }
    if (!fromOnboarding) return
    try {
      await AsyncStorage.removeItem(FROM_ONBOARDING_KEY)
      await AsyncStorage.removeItem('@easner_onboarding_completed')
      if ((global as any).triggerOnboardingCheck) {
        ;(global as any).triggerOnboardingCheck()
      }
    } catch (error) {
      console.error('Error going back to onboarding:', error)
    }
  }, [modeStack.length, fromOnboarding])

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modeStack.length > 1) {
        void handleBack()
        return true
      }
      if (fromOnboarding) {
        void handleBack()
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [modeStack.length, fromOnboarding, handleBack])

  const handleHelp = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert('Help', 'Need assistance? Contact support at support@easner.com')
  }

  const validateForm = () => {
    if (mode === 'login') {
      if (!email || !password) {
        Alert.alert('Error', 'Please fill in all fields')
        return false
      }
      return true
    }
    if (!fullName?.trim() || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields')
      return false
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long')
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address')
      return false
    }
    return true
  }

  const handleSubmit = async (opts?: { otp?: string }) => {
    if (mode === 'signup' && signupStep === 'otp') {
      const otpToVerify = (opts?.otp ?? signupOtp).replace(/\D/g, '').slice(0, 6)
      setIsLoading(true)
      setSignupOtpError('')
      setSignupOtpNotice('')
      try {
        const { error } = await verifySignupOtp(email, otpToVerify)
        if (error) {
          setSignupOtpError(error.message || 'Invalid verification code.')
          return
        }
        // No modal: successful verification continues into PIN/app flow via auth state change.
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (!validateForm()) return

    setIsLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password, false)
        if (error) {
          const msg = error.message || ''
          if (msg.toLowerCase().includes('email not confirmed')) {
            Alert.alert('Sign in', 'Please confirm your email before signing in.')
          } else {
            Alert.alert('Sign in', 'Invalid credentials')
          }
        }
      } else {
        const { error: signUpError, needsEmailConfirmation } = await signUp(
          email,
          password,
          fullName.trim()
        )
        if (signUpError) {
          Alert.alert('Create account', signUpError.message || 'Something went wrong.')
        } else if (needsEmailConfirmation) {
          setSignupStep('otp')
          setSignupOtp('')
          setSignupOtpNotice('')
          setSignupResendCooldown(60)
          // No modal: OTP screen copy + keypad flow is the guidance.
        } else {
          Alert.alert(
            'Account ready',
            'You are signed in. Continue in the app.',
            [{ text: 'OK' }]
          )
        }
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setIsLoading(true)
    try {
      const { error } = await signInWithGoogle()
      if (error) {
        Alert.alert('Google sign-in', error.message || 'Unable to continue with Google.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const isLogin = mode === 'login'
  const isSignupOtp = !isLogin && signupStep === 'otp'
  const signupOtpDigits = signupOtp.replace(/\D/g, '').slice(0, 6)
  const otpActiveIndex = Math.min(signupOtpDigits.length, 5)

  const applySignupOtp = useCallback(
    (nextValue: string) => {
      const digits = nextValue.replace(/\D/g, '').slice(0, 6)
      setSignupOtp(digits)
      if (signupOtpError) setSignupOtpError('')
      if (signupOtpNotice) setSignupOtpNotice('')
      if (digits.length === 6) {
        setTimeout(() => {
          void handleSubmit({ otp: digits })
        }, 80)
      }
    },
    [handleSubmit, signupOtpError, signupOtpNotice],
  )

  useOtpClipboardAutofill({
    enabled: isSignupOtp && !isLoading,
    value: signupOtp,
    onAutofill: applySignupOtp,
  })

  const handleOtpDigit = (d: string) => {
    if (isLoading) return
    if (signupOtpDigits.length >= 6) return
    applySignupOtp(`${signupOtpDigits}${d}`)
  }

  const handleOtpBackspace = () => {
    if (isLoading) return
    if (signupOtpDigits.length === 0) return
    if (signupOtpError) setSignupOtpError('')
    if (signupOtpNotice) setSignupOtpNotice('')
    setSignupOtp(signupOtpDigits.slice(0, -1))
  }

  useEffect(() => {
    if (signupResendCooldown <= 0) return
    const id = setInterval(() => {
      setSignupResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [signupResendCooldown])

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContainer,
            {
              paddingTop: insets.top + spacing[3],
              paddingBottom: Math.max(insets.bottom, spacing[6]),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            {showBackButton ? (
              <Pressable android_ripple={ripple.neutral} style={styles.backButton} onPress={handleBack} >
                <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
              </Pressable>
            ) : (
              <View style={styles.backPlaceholder} />
            )}
            <Pressable android_ripple={ripple.neutral} style={styles.headerButton} onPress={handleHelp} >
              <View style={styles.headerButtonCircle}>
                <Ionicons name="help-circle-outline" size={20} color={colors.text.primary} />
              </View>
            </Pressable>
          </View>

          <Text style={authScreenStyles.screenTitle}>
            {isLogin ? 'Welcome back' : isSignupOtp ? 'Verify your email' : 'Open an account'}
          </Text>

          <View style={styles.form}>
            {!isLogin && signupStep === 'form' && (
              <Text style={authScreenStyles.termsIntro}>
                By creating an account you agree to our{' '}
                <Text
                  style={authScreenStyles.termsLink}
                  onPress={() => termsLink.openLink(TERMS_URL, 'Terms')}
                >
                  Terms
                </Text>
                .
              </Text>
            )}

            {!isSignupOtp && (
              <>
                <GoogleOutlineButton
                  label={isLogin ? 'Sign in with Google' : 'Sign up with Google'}
                  onPress={handleGoogleAuth}
                  disabled={isLoading}
                />
                <OrDivider />
              </>
            )}

            {!isLogin && signupStep === 'form' && (
              <TextField
                label="Full name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="John Doe"
                autoCapitalize="words"
                returnKeyType="next"
                editable={!isLoading}
                containerStyle={styles.fieldFlush}
              />
            )}

            {!isSignupOtp && (
              <>
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  editable={!isLoading}
                  containerStyle={styles.fieldFlush}
                />

                <TextField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                  containerStyle={styles.fieldFlush}
                  rightAccessory={
                    <Pressable
                     android_ripple={ripple.neutral}
                      style={styles.eyeButton}
                      onPress={() => setPasswordVisible(!passwordVisible)} >
                      <View style={styles.eyeButtonCircle}>
                        <Ionicons
                          name={passwordVisible ? 'eye-off' : 'eye'}
                          size={18}
                          color={colors.semantic.mutedForeground}
                        />
                      </View>
                    </Pressable>
                  }
                />
              </>
            )}

            {isLogin && (
              <Pressable
               android_ripple={ripple.neutral}
                style={styles.forgotPasswordLink}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  navigation.navigate('ForgotPassword')
                }} >
                <Text style={authScreenStyles.forgotPasswordText}>Forgot password?</Text>
              </Pressable>
            )}

            {!isLogin && signupStep === 'otp' && (
              <View style={styles.otpWrap}>
                <Text style={styles.otpHint}>
                  Enter the 6-digit code we sent to {email || 'your email'}
                </Text>
                <View style={styles.otpBoxesRow} accessibilityLabel="One-time code">
                  {isLoading ? (
                    <View style={styles.otpBoxesLoadingOnly}>
                      <ActivityIndicator size="small" color={colors.primary.main} />
                    </View>
                  ) : (
                    Array.from({ length: 6 }, (_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.otpBox,
                          otpActiveIndex === i ? styles.otpBoxActive : styles.otpBoxIdle,
                        ]}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      >
                        <Text style={styles.otpDigit}>{signupOtpDigits[i] ?? ''}</Text>
                      </View>
                    ))
                  )}
                </View>
                <View style={styles.otpHintSlot} accessibilityLiveRegion="polite">
                  {signupOtpError ? (
                    <Text style={styles.otpErrorText}>{signupOtpError}</Text>
                  ) : signupOtpNotice ? (
                    <Text style={styles.otpNoticeText}>{signupOtpNotice}</Text>
                  ) : (
                    <Text style={styles.otpHintPlaceholder}>{' '}</Text>
                  )}
                </View>
                <Pressable
                  android_ripple={ripple.neutral}
                  onPress={async () => {
                    if (signupResendCooldown > 0 || isLoading) return
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setSignupOtpError('')
                    setSignupOtpNotice('')
                    const { error } = await resendSignupOtp(email)
                    if (error) {
                      setSignupOtpError(error.message || 'Unable to resend code.')
                      return
                    }
                    setSignupOtpNotice('New code sent to your email address.')
                    setSignupResendCooldown(60)
                  }}
                  disabled={signupResendCooldown > 0 || isLoading}
                  style={styles.resendButton}
                >
                  <Text
                    style={[
                      styles.resendText,
                      (signupResendCooldown > 0 || isLoading) && styles.resendTextDisabled,
                    ]}
                  >
                    {signupResendCooldown > 0
                      ? `Resend code in ${signupResendCooldown}s`
                      : 'Resend code'}
                  </Text>
                </Pressable>
                <View style={styles.otpKeypad}>
                  <PinKeypad
                    onDigit={handleOtpDigit}
                    onBackspace={handleOtpBackspace}
                    disabled={isLoading}
                    filledCount={signupOtpDigits.length}
                  />
                </View>
              </View>
            )}

            {!isSignupOtp && (
              <View style={styles.primaryCtaWrap}>
                <GlossyPrimaryButton
                  title={
                    isLoading
                      ? isLogin
                        ? 'Signing in…'
                        : 'Creating account…'
                      : isLogin
                        ? 'Sign in'
                        : 'Create account'
                  }
                  onPress={handleSubmit}
                  disabled={isLoading}
                  style={styles.glossyCta}
                />
              </View>
            )}

            <View style={styles.footer}>
              <Text style={authScreenStyles.footerMuted}>
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
              </Text>
              <Pressable
               android_ripple={ripple.neutral}
                onPress={() => switchMode(isLogin ? 'signup' : 'login')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text style={authScreenStyles.footerLink}>{isLogin ? 'Sign up' : 'Sign in'}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ExternalLinkModal
        visible={termsLink.isVisible}
        url={termsLink.url}
        title={termsLink.title}
        onClose={termsLink.closeLink}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.semantic.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: spacing[5],
    maxWidth: 448,
    width: '100%',
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  backPlaceholder: {
    width: 44,
    height: 44,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    justifyContent: 'center',
    alignItems: 'center',
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
  form: {
    width: '100%',
  },
  otpWrap: {
    width: '100%',
    marginTop: spacing[2],
    marginBottom: spacing[4],
    alignItems: 'center',
  },
  otpHint: {
    ...authScreenStyles.termsIntro,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  otpBoxesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginBottom: spacing[6],
  },
  otpBoxesLoadingOnly: {
    width: 50 * 6 + spacing[2] * 5,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBox: {
    width: 50,
    height: 58,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    backgroundColor: colors.semantic.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpBoxIdle: {
    borderColor: colors.semantic.input,
  },
  otpBoxActive: {
    borderColor: colors.primary.main,
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.semantic.foreground,
  },
  otpKeypad: {
    width: '100%',
    marginTop: spacing[4],
  },
  otpHintSlot: {
    width: '100%',
    minHeight: 44,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  otpErrorText: {
    ...authScreenStyles.forgotPasswordText,
    color: colors.error.dark,
    textAlign: 'center',
    fontWeight: '600',
  },
  otpNoticeText: {
    ...authScreenStyles.forgotPasswordText,
    color: colors.success.dark,
    textAlign: 'center',
    fontWeight: '600',
  },
  otpHintPlaceholder: {
    fontSize: 1,
    color: 'transparent',
  },
  resendButton: {
    alignItems: 'center',
    padding: spacing[2],
    marginBottom: spacing[2],
  },
  resendText: {
    ...authScreenStyles.footerLink,
    textAlign: 'center',
  },
  resendTextDisabled: {
    color: colors.text.secondary,
  },
  fieldFlush: {
    marginBottom: spacing[3],
  },
  primaryCtaWrap: {
    width: '100%',
    marginBottom: spacing[4],
  },
  glossyCta: {
    width: '100%',
    flexGrow: 0,
    minHeight: 52,
  },
  eyeButton: {
    padding: spacing[2],
  },
  eyeButtonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forgotPasswordLink: {
    alignSelf: 'flex-start',
    marginBottom: spacing[4],
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[2],
  },
})
