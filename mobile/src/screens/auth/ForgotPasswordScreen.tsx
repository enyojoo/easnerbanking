import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { authScreenStyles } from '../../theme/authScreen'
import { Button, TextField } from '../../components/ui'

export default function ForgotPasswordScreen({ navigation }: NavigationProps) {
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpRefs = useRef<(TextInput | null)[]>([])
  const insets = useSafeAreaInsets()

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('ForgotPassword')
  }, [])

  const handleBack = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (step === 'otp') {
      setStep('email')
      setOtp(['', '', '', '', '', ''])
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'easner://reset-password',
      })

      if (error) {
        setError(error.message)
      } else {
        setStep('otp')
        setMessage('')
        startResendCooldown()
      }
    } catch (error) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6)
      
      if (digits.length === 6) {
        const newOtp = digits.split('')
        setOtp(newOtp)
        setTimeout(() => {
          otpRefs.current[5]?.focus()
        }, 0)
        return
      } else if (digits.length > 0) {
        const newOtp = [...otp]
        for (let i = 0; i < Math.min(digits.length, 6); i++) {
          newOtp[i] = digits[i]
        }
        setOtp(newOtp)
        const nextIndex = Math.min(digits.length, 5)
        setTimeout(() => {
          otpRefs.current[nextIndex]?.focus()
        }, 0)
        return
      }
    }

    if (value.length > 1) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    if (value && index < 5) {
      setTimeout(() => {
        otpRefs.current[index + 1]?.focus()
      }, 0)
    }
  }

  const handleOtpKeyPress = (index: number, e: any) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpSubmit = async () => {
    const otpCode = otp.join('')

    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits')
      return
    }

    setLoading(true)
    setError('')

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://app.easner.com'
      const response = await fetch(`${apiUrl}/api/auth/verify-reset-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          otp: otpCode,
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'easner://reset-password',
      })

      if (error) {
        setError('Failed to resend code. Please try again.')
      } else {
        setMessage('New code sent to your email address.')
        startResendCooldown()
      }
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
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <View style={styles.headerSpacer} />
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleHelp}
              activeOpacity={0.7}
            >
              <View style={styles.headerButtonCircle}>
                <Ionicons name="help-circle-outline" size={20} color={colors.text.primary} />
              </View>
            </TouchableOpacity>
          </View>

          <Text style={authScreenStyles.screenTitle}>
            {step === 'email' ? 'Forgot password?' : 'Enter verification code'}
          </Text>

          {step === 'otp' && error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

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

                <Button
                  title={loading ? 'Sending…' : 'Send verification code'}
                  onPress={handleEmailSubmit}
                  disabled={loading}
                  loading={loading}
                  variant="default"
                  fullWidth
                  style={styles.primaryCta}
                />
              </>
            ) : (
              <>
                <View style={styles.otpSection}>
                  <Text style={authScreenStyles.fieldLabel}>Enter 6-digit code</Text>
                  <Text style={styles.subtitle}>
                    We've sent a 6-digit code to {email}
                  </Text>
                  <View style={styles.otpContainer}>
                    {otp.map((digit, index) => (
                      <TextInput
                        key={index}
                        ref={(ref) => {
                          otpRefs.current[index] = ref
                        }}
                        style={styles.otpInput}
                        value={digit}
                        onChangeText={(value) => handleOtpChange(index, value)}
                        onKeyPress={(e) => handleOtpKeyPress(index, e)}
                        keyboardType="numeric"
                        maxLength={6}
                        editable={!loading}
                        selectTextOnFocus
                      />
                    ))}
                  </View>
                </View>

                <Button
                  title={loading ? 'Verifying…' : 'Verify code'}
                  onPress={handleOtpSubmit}
                  disabled={loading || otp.join('').length !== 6}
                  loading={loading}
                  variant="default"
                  fullWidth
                  style={styles.primaryCta}
                />

                <TouchableOpacity
                  onPress={handleResendOtp}
                  disabled={resendCooldown > 0 || loading}
                  style={styles.resendButton}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.resendText, (resendCooldown > 0 || loading) && styles.resendTextDisabled]}>
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                  </Text>
                </TouchableOpacity>
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
  },
  errorContainer: {
    marginBottom: spacing[4],
    padding: spacing[3],
    backgroundColor: colors.error.background,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.error.light,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    textAlign: 'center',
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
  primaryCta: {
    marginBottom: spacing[4],
  },
  otpSection: {
    marginBottom: spacing[5],
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  otpInput: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.md,
    textAlign: 'center',
    ...textStyles.titleMedium,
    fontWeight: '600',
    backgroundColor: colors.semantic.background,
    color: colors.semantic.foreground,
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
