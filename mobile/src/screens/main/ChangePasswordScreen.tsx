import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Animated,
  Platform,
} from 'react-native'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { CenteredWebFlowPage } from '../../components/layout/CenteredWebFlowPage'
import KeyboardSafeContainer from '../../components/KeyboardSafeContainer'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'
import { NavigationProps } from '../../types'
import {
  colors,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  textStyles,
  borderRadius,
  spacing,
  motion,
  standardInputMetrics,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { useToast } from '../../components/ToastProvider'
import { haptics } from '../../lib/haptics'
import { supabase } from '../../lib/supabase'
import { notifySecurityAlert } from '../../lib/securityAlertNotify'
import { useAuth } from '../../contexts/AuthContext'
import { PostHogMaskView } from 'posthog-react-native'

const MIN_PASSWORD_LEN = 8

export default function ChangePasswordScreen({ navigation }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const { showError, showSuccess } = useToast()
  const { signOut } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  // Run entrance animations
  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showError('Please fill in all fields')
      return
    }

    if (newPassword !== confirmPassword) {
      showError('New passwords do not match')
      return
    }

    if (newPassword.length < MIN_PASSWORD_LEN) {
      showError(`Password must be at least ${MIN_PASSWORD_LEN} characters`)
      return
    }

    if (newPassword === currentPassword) {
      showError('New password must be different from your current password')
      return
    }

    setLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const email = session?.user?.email?.trim()
      if (!email) {
        showError('No active session. Please sign in again.')
        return
      }

      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (signErr) {
        showError('Current password is incorrect')
        return
      }

      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updErr) {
        showError(updErr.message || 'Could not update password')
        return
      }

      void notifySecurityAlert('password_changed')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showSuccess('Password updated. Sign in again on all devices.')
      await signOut({ scope: 'global' })
    } catch (error) {
      console.error('Error changing password:', error)
      showError('Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const isFormValid = currentPassword && newPassword && confirmPassword

  return (
    <ScreenWrapper>
      <CenteredWebFlowPage>
      <KeyboardSafeContainer style={styles.container}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
          showsVerticalScrollIndicator={false}
        >
          {/* Premium Header - Matching Send Flow */}
          <Animated.View
            style={[
              styles.header,
              {
                opacity: headerAnim,
                transform: [{
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-motion.screenEnterTranslateY, 0],
                  })
                }]
              }
            ]}
          >
            <Pressable
             android_ripple={ripple.neutral}
              onPress={async () => {
                haptics.tap()
                navigation.goBack()
              }}
              style={styles.backButton} >
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Change Password</Text>
              <Text style={styles.subtitle}>
                Changing your password signs you out on every device.
              </Text>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.content,
              {
                opacity: contentAnim,
                transform: [{
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [motion.screenEnterTranslateY, 0],
                  })
                }]
              }
            ]}
          >
            <View style={styles.sectionCard}>
            <View style={styles.sectionInner}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
              <PostHogMaskView style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current password"
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showCurrentPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  textContentType="password"
                  autoComplete="password"
                  editable={!loading}
                />
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.eyeButton}
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? (
                    <EyeOff size={20} color={colors.text.tertiary} strokeWidth={2} />
                  ) : (
                    <Eye size={20} color={colors.text.tertiary} strokeWidth={2} />
                  )}
                </Pressable>
              </PostHogMaskView>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>NEW PASSWORD</Text>
              <PostHogMaskView style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  textContentType="newPassword"
                  autoComplete="password-new"
                  editable={!loading}
                />
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.eyeButton}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff size={20} color={colors.text.tertiary} strokeWidth={2} />
                  ) : (
                    <Eye size={20} color={colors.text.tertiary} strokeWidth={2} />
                  )}
                </Pressable>
              </PostHogMaskView>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
              <PostHogMaskView style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  textContentType="newPassword"
                  autoComplete="password-new"
                  editable={!loading}
                />
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color={colors.text.tertiary} strokeWidth={2} />
                  ) : (
                    <Eye size={20} color={colors.text.tertiary} strokeWidth={2} />
                  )}
                </Pressable>
              </PostHogMaskView>
            </View>

            <GlossyPrimaryButton
              title={loading ? 'Updating…' : 'Update password'}
              onPress={handleSubmit}
              disabled={!isFormValid || loading}
              style={styles.submitCta}
            />
            </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardSafeContainer>
      </CenteredWebFlowPage>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing[1],
  },
  content: {
    padding: spacing[5],
    gap: spacing[4],
  },
  sectionCard: {
    ...surfaceFrameStyle(colors),
    marginBottom: spacing[4],
    paddingBottom: spacing[2],
  },
  sectionInner: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[3],
  },
  inputContainer: {
    marginBottom: spacing[4],
  },
  inputLabel: {
    ...textStyles.labelSmall,
    color: colors.text.secondary,
    marginBottom: spacing[2],
    letterSpacing: 0.5,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.card,
    minHeight: 52,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    textAlignVertical: 'center',
    ...standardInputMetrics,
  },
  eyeButton: {
    padding: spacing[3],
  },
  submitCta: {
    marginTop: spacing[2],
  },
})

