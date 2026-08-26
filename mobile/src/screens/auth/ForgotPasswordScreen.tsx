import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native'
import { ArrowLeft, HelpCircle } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getApiBaseUrl } from '../../lib/apiClient'
import { NavigationProps } from '../../types'
import { colors, surfaceChromeCircleStyle, textStyles, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { TextField, OtpCodeInput } from '../../components/ui'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'
import { useToast } from '../../components/ToastProvider'
import KeyboardAwareScreen from '../../components/KeyboardAwareScreen'
import { haptics } from '../../lib/haptics'
import { AuthFlowContainer } from '../../components/layout/AuthFlowContainer'

export default function ForgotPasswordScreen({ navigation }: NavigationProps) {
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const insets = useSafeAreaInsets()
  const { showInfo } = useToast()

  const handleBack = async () => {
    haptics.tap()
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
    haptics.tap()
    showInfo('Need assistance? Contact support at support@easner.com')
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

  const handleOtpSubmit = async (overrideCode?: string) => {
    const code = (overrideCode ?? otpDigits).replace(/\D/g, '').slice(0, 6)
    if (code.length !== 6) {
      setMessage('')
      setError('Please enter all 6 digits')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

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

  const applyOtpCode = useCallback(
    (nextValue: string) => {
      const digits = nextValue.replace(/\D/g, '').slice(0, 6)
      setOtpCode(digits)
      if (error) setError('')
      if (message) setMessage('')
      if (digits.length === 6) {
        setTimeout(() => {
          void handleOtpSubmit(digits)
        }, 80)
      }
    },
    [error, handleOtpSubmit, message],
  )

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return

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
      <KeyboardAwareScreen
        style={styles.keyboardContainer}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: insets.top + spacing[4],
            paddingBottom: Math.max(insets.bottom, spacing[5]),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <AuthFlowContainer>
          {/* Header with back and help buttons */}
          <View style={styles.header}>
            <Pressable
             android_ripple={ripple.neutral}
              style={styles.backButton}
              onPress={handleBack} >
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
            <View style={styles.headerSpacer} />
            <Pressable
             android_ripple={ripple.neutral}
              style={styles.headerButton}
              onPress={handleHelp} >
              <View style={styles.headerButtonCircle}>
                <HelpCircle size={20} color={colors.text.primary} strokeWidth={2} />
              </View>
            </Pressable>
          </View>

          <Text style={authScreenStyles.screenTitleCompact}>
            {step === 'email' ? 'Forgot password?' : 'Enter verification code'}
          </Text>

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
                  returnKeyType="go"
                  textContentType="emailAddress"
                  autoComplete="email"
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
                  <OtpCodeInput
                    id="forgot-password-otp"
                    value={otpCode}
                    onChange={applyOtpCode}
                    autoFocus
                    disabled={loading}
                    loading={loading}
                    containerStyle={styles.otpInput}
                  />
                  <View style={styles.otpHintSlot} accessibilityLiveRegion="polite">
                    {error ? (
                      <Text style={styles.otpErrorText}>{error}</Text>
                    ) : message ? (
                      <Text style={styles.otpNoticeText}>{message}</Text>
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
              </>
            )}
          </View>
        </AuthFlowContainer>
        </KeyboardAwareScreen>
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
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerButton: {
    padding: spacing[1],
  },
  headerSpacer: {
    flex: 1,
  },
  headerButtonCircle: {
    ...surfaceChromeCircleStyle(colors, 40),
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
  otpNoticeText: {
    ...textStyles.bodySmall,
    color: colors.success.main,
    textAlign: 'center',
    fontWeight: '600',
  },
  otpHintPlaceholder: {
    fontSize: 1,
    color: 'transparent',
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
  otpInput: {
    marginTop: spacing[2],
    marginBottom: spacing[2],
    width: '100%',
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
