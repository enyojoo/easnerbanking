import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getApiBaseUrl } from '../../lib/apiClient'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { TextField } from '../../components/ui'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'
import { PinKeypad } from '../../components/pin'

export default function ForgotPasswordScreen({ navigation }: NavigationProps) {
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const insets = useSafeAreaInsets()

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('ForgotPassword')
  }, [])

  const handleBack = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (step === 'otp') {
      setStep('email')
      setOtpCode('')
      setError('')
      setMessage('')
      setResendCooldown(0)
    } else {
      navigation.navigate('Auth')
    }
  }

  const handleHelp = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert('Help', 'Need assistance? Contact support at support@easner.com')
  }

  const handleEmailSubmit = async () => {
    if (!email) {
      setError('Please enter your email address')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const apiUrl = getApiBaseUrl()
      const response = await fetch(`${apiUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        setError('Unable to send verification code. Please try again.')
        return
      }

      setStep('otp')
      setMessage('')
      setOtpCode('')
      startResendCooldown()
    } catch (error) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const otpDigits = otpCode.replace(/\D/g, '').slice(0, 6)
  const otpActiveIndex = Math.min(otpDigits.length, 5)

  const handleOtpDigit = (d: string) => {
    if (loading) return
    if (otpDigits.length >= 6) return
    const next = `${otpDigits}${d}`.slice(0, 6)
    setOtpCode(next)
    if (next.length === 6) {
      setTimeout(() => {
        void handleOtpSubmit(next)
      }, 80)
    }
  }

  const handleOtpBackspace = () => {
    if (loading) return
    if (otpDigits.length === 0) return
    setOtpCode(otpDigits.slice(0, -1))
  }

  const handleOtpSubmit = async (overrideCode?: string) => {
    const code = (overrideCode ?? otpDigits).replace(/\D/g, '').slice(0, 6)
    if (code.length !== 6) {
      setError('Please enter all 6 digits')
      return
    }

    setLoading(true)
    setError('')

    try {
      const apiUrl = getApiBaseUrl()
      const response = await fetch(`${apiUrl}/api/auth/verify-reset-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          otp: code,
        }),
      })

      if (!response.ok) {
        setError('Invalid or expired verification code')
        return
      }

      let data
      try {
        const responseText = await response.text()
        data = JSON.parse(responseText)
      } catch (parseError) {
        setError('Invalid response from server. Please try again.')
        return
      }

      if (data.resetToken) {
        navigation.navigate('ResetPassword', { 
          email: email,
          resetToken: data.resetToken 
        })
      } else {
        setError(data.error || 'Invalid verification code')
      }
    } catch (error) {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return

    setLoading(true)
    setError('')

    try {
      const apiUrl = getApiBaseUrl()
      const response = await fetch(`${apiUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        setError('Failed to resend code. Please try again.')
        return
      }

      setMessage('New code sent to your email address.')
      startResendCooldown()
    } catch (error) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const startResendCooldown = () => {
    setResendCooldown(60)
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

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
              paddingTop: insets.top + spacing[4],
              paddingBottom: Math.max(insets.bottom, spacing[5]),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header with back and help buttons */}
          <View style={styles.header}>
            <Pressable
             android_ripple={ripple.neutral}
              style={styles.backButton}
              onPress={handleBack} >
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </Pressable>
            <View style={styles.headerSpacer} />
            <Pressable
             android_ripple={ripple.neutral}
              style={styles.headerButton}
              onPress={handleHelp} >
              <View style={styles.headerButtonCircle}>
                <Ionicons name="help-circle-outline" size={20} color={colors.text.primary} />
              </View>
            </Pressable>
          </View>

          <Text style={authScreenStyles.screenTitle}>
            {step === 'email' ? 'Forgot password?' : 'Enter verification code'}
          </Text>

          {/* Error is shown in a fixed slot under the OTP boxes (PIN-style). */}

          {message ? (
            <View style={styles.messageContainer}>
              <Text style={styles.messageText}>{message}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            {step === 'email' ? (
              <>
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t)
                    setError('')
                  }}
                  placeholder="Enter your email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  error={error || undefined}
                  containerStyle={styles.fieldFlush}
                />

                <View style={styles.primaryCtaWrap}>
                  <GlossyPrimaryButton
                    title={loading ? 'Sending…' : 'Send verification code'}
                    onPress={handleEmailSubmit}
                    disabled={loading}
                    style={styles.glossyCta}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.otpSection}>
                  <Text style={styles.subtitle}>
                    We've sent a 6-digit code to {email}
                  </Text>
                  <View style={styles.otpBoxesRow} accessibilityLabel="One-time code">
                    {loading ? (
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
                          <Text style={styles.otpDigit}>{otpDigits[i] ?? ''}</Text>
                        </View>
                      ))
                    )}
                  </View>
                  <View style={styles.otpHintSlot} accessibilityLiveRegion="polite">
                    {error ? (
                      <Text style={styles.otpErrorText}>{error}</Text>
                    ) : (
                      <Text style={styles.otpHintPlaceholder}>{' '}</Text>
                    )}
                  </View>
                </View>

                <Pressable
                 android_ripple={ripple.neutral}
                  onPress={handleResendOtp}
                  disabled={resendCooldown > 0 || loading}
                  style={styles.resendButton} >
                  <Text style={[styles.resendText, (resendCooldown > 0 || loading) && styles.resendTextDisabled]}>
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                  </Text>
                </Pressable>

                <View style={styles.otpKeypad}>
                  <PinKeypad
                    onDigit={handleOtpDigit}
                    onBackspace={handleOtpBackspace}
                    disabled={loading}
                    filledCount={otpDigits.length}
                  />
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[6],
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
    marginRight: spacing[3],
  },
  headerButton: {
    padding: spacing[1],
  },
  headerSpacer: {
    flex: 1,
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
  subtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing[4],
    textAlign: 'center',
  },
  otpHintSlot: {
    width: '100%',
    minHeight: 44,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpErrorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    textAlign: 'center',
    fontWeight: '600',
  },
  otpHintPlaceholder: {
    fontSize: 1,
    color: 'transparent',
  },
  messageContainer: {
    marginBottom: spacing[4],
    padding: spacing[3],
    backgroundColor: colors.success.background,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.success.light,
  },
  messageText: {
    ...textStyles.bodySmall,
    color: colors.success.main,
    textAlign: 'center',
  },
  form: {
    width: '100%',
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
  otpSection: {
    marginBottom: spacing[5],
  },
  otpBoxesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginTop: spacing[2],
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
  resendButton: {
    alignItems: 'center',
    padding: spacing[2],
  },
  resendText: {
    ...authScreenStyles.footerLink,
    textAlign: 'center',
  },
  resendTextDisabled: {
    color: colors.text.secondary,
  },
})
