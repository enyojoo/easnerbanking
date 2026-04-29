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
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, motion } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { useToast } from '../../components/ToastProvider'

export default function ChangePasswordScreen({ navigation }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const { showError, showInfo } = useToast()
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

    if (newPassword.length < 8) {
      showError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      // TODO: Implement password change API call
      showInfo('Password change functionality will be implemented')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
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
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing[5] }}
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
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.goBack()
              }}
              style={styles.backButton} >
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Change Password</Text>
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
            {/* Password Form */}
            <View style={styles.sectionCard}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current password"
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showCurrentPassword}
                  editable={!loading}
                />
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.eyeButton}
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? (
                    <EyeOff size={20} color={colors.brand.slate} strokeWidth={2} />
                  ) : (
                    <Eye size={20} color={colors.brand.slate} strokeWidth={2} />
                  )}
                </Pressable>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>NEW PASSWORD</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showNewPassword}
                  editable={!loading}
                />
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.eyeButton}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff size={20} color={colors.brand.slate} strokeWidth={2} />
                  ) : (
                    <Eye size={20} color={colors.brand.slate} strokeWidth={2} />
                  )}
                </Pressable>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showConfirmPassword}
                  editable={!loading}
                />
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color={colors.brand.slate} strokeWidth={2} />
                  ) : (
                    <Eye size={20} color={colors.brand.slate} strokeWidth={2} />
                  )}
                </Pressable>
              </View>
            </View>

            <Pressable
             android_ripple={ripple.neutral}
              style={[
                styles.submitButton,
                (!isFormValid || loading) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!isFormValid || loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Updating...' : 'Update Password'}
              </Text>
            </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </View>
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
  content: {
    padding: spacing[5],
  },
  sectionCard: {
    ...surfaceFrameStyle(colors),
    marginBottom: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: spacing[5],
  },
  sectionTitle: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    marginBottom: spacing[5],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
  },
  inputContainer: {
    marginBottom: spacing[5],
    paddingHorizontal: spacing[5],
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
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.background.primary,
    minHeight: 48,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.textInputMedium,
    color: colors.text.primary,
    fontSize: 13,
    textAlignVertical: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
      ios: {
        paddingVertical: 11,
      },
    }),
  },
  eyeButton: {
    padding: spacing[3],
  },
  submitButton: {
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    alignItems: 'center',
    marginTop: spacing[2],
    marginHorizontal: spacing[5],
    marginBottom: spacing[5],
  },
  submitButtonDisabled: {
    backgroundColor: colors.neutral[400],
  },
  submitButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.inverse,
    fontWeight: '600',
  },
})

