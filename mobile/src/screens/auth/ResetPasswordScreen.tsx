import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native'
import { ArrowLeft, Eye, EyeOff, HelpCircle } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { getApiBaseUrl } from '../../lib/apiClient'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { colors, borderRadius, spacing, surfaceChromeCircleStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { TextField } from '../../components/ui'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'
import { useToast } from '../../components/ToastProvider'
import KeyboardAwareScreen from '../../components/KeyboardAwareScreen'
import { haptics } from '../../lib/haptics'
import { AuthFlowContainer } from '../../components/layout/AuthFlowContainer'
import { PostHogMaskView } from 'posthog-react-native'

export default function ResetPasswordScreen({ navigation, route }: NavigationProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [isValidSession, setIsValidSession] = useState(false)
  const insets = useSafeAreaInsets()
  const { showError, showInfo, showSuccess } = useToast()

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('ResetPassword')
  }, [])

  useEffect(() => {
    const { email, resetToken } = route.params || {}
    
    if (email && resetToken) {
      setIsValidSession(true)
    } else {
      showError('Invalid or expired reset link')
      setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Auth' }],
        })
      }, 400)
    }
  }, [route.params])

  const handleBack = async () => {
    haptics.tap()
    navigation.navigate('Auth')
  }

  const handleHelp = async () => {
    haptics.tap()
    showInfo('Need assistance? Contact support at support@easner.com')
  }

  const validateForm = () => {
    if (!password || !confirmPassword) {
      showError('Please fill in all fields')
      return false
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match')
      return false
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters long')
      return false
    }

    return true
  }

  const handleResetPassword = async () => {
    if (!validateForm()) return

    setLoading(true)
    try {
      const { email, resetToken } = route.params || {}
      
      if (!email || !resetToken) {
        showError('Invalid reset session')
        return
      }

      const apiUrl = getApiBaseUrl()
      const response = await fetch(`${apiUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: resetToken,
          email: email,
          newPassword: password,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        showSuccess('Your password has been successfully updated')
        setTimeout(() => {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Auth' }],
          })
        }, 500)
      } else {
        showError(data.error || 'Failed to reset password')
      }
    } catch (error) {
      console.error('Password reset error:', error)
      showError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isValidSession) {
    return (
      <View style={styles.container}>
        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + spacing[4],
              paddingBottom: Math.max(insets.bottom, spacing[5]),
            },
          ]}
        >
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
            <Text style={authScreenStyles.screenTitleCompact}>Validating reset link</Text>
            <Text style={authScreenStyles.subtitle}>
              Please wait while we validate your reset link…
            </Text>
        </View>
      </View>
    )
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

          <Text style={authScreenStyles.screenTitleCompact}>Reset password</Text>

          <View style={styles.form}>
            <PostHogMaskView>
            <TextField
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter new password"
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              textContentType="newPassword"
              autoComplete="password-new"
              editable={!loading}
              containerStyle={styles.fieldFlush}
              rightAccessory={
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.eyeButton}
                  onPress={() => setPasswordVisible(!passwordVisible)} >
                  <View style={styles.eyeButtonCircle}>
                    {passwordVisible ? (
                      <EyeOff size={18} color={colors.semantic.mutedForeground} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={colors.semantic.mutedForeground} strokeWidth={2} />
                    )}
                  </View>
                </Pressable>
              }
            />
            </PostHogMaskView>

            <PostHogMaskView>
            <TextField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              secureTextEntry={!confirmPasswordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              textContentType="newPassword"
              autoComplete="password-new"
              editable={!loading}
              containerStyle={styles.fieldFlush}
              rightAccessory={
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.eyeButton}
                  onPress={() => setConfirmPasswordVisible(!confirmPasswordVisible)} >
                  <View style={styles.eyeButtonCircle}>
                    {confirmPasswordVisible ? (
                      <EyeOff size={18} color={colors.semantic.mutedForeground} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={colors.semantic.mutedForeground} strokeWidth={2} />
                    )}
                  </View>
                </Pressable>
              }
            />
            </PostHogMaskView>

            <View style={styles.primaryCtaWrap}>
              <GlossyPrimaryButton
                title={loading ? 'Updating…' : 'Update password'}
                onPress={handleResetPassword}
                disabled={loading}
                style={styles.glossyCta}
              />
            </View>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing[5],
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
  form: {
    width: '100%',
  },
  fieldFlush: {
    marginBottom: spacing[3],
  },
  primaryCtaWrap: {
    width: '100%',
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
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
