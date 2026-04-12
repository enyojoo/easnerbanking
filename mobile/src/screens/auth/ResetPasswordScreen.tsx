import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { colors, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { Button, TextField } from '../../components/ui'

export default function ResetPasswordScreen({ navigation, route }: NavigationProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [isValidSession, setIsValidSession] = useState(false)
  const insets = useSafeAreaInsets()

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('ResetPassword')
  }, [])

  useEffect(() => {
    const { email, resetToken } = route.params || {}
    
    if (email && resetToken) {
      setIsValidSession(true)
    } else {
      Alert.alert('Error', 'Invalid or expired reset link', [
        { text: 'OK', onPress: () => {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Auth' }],
          })
        }}
      ])
    }
  }, [route.params])

  const handleBack = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    navigation.navigate('Auth')
  }

  const handleHelp = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert('Help', 'Need assistance? Contact support at support@easner.com')
  }

  const validateForm = () => {
    if (!password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields')
      return false
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match')
      return false
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long')
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
        Alert.alert('Error', 'Invalid reset session')
        return
      }

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://app.easner.com'
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
        Alert.alert(
          'Password Updated',
          'Your password has been successfully updated',
          [{ text: 'OK', onPress: () => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Auth' }],
            })
          }}]
        )
      } else {
        Alert.alert('Error', data.error || 'Failed to reset password')
      }
    } catch (error) {
      console.error('Password reset error:', error)
      Alert.alert('Error', 'Network error. Please check your connection and try again.')
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
            <Text style={authScreenStyles.screenTitle}>Validating reset link</Text>
            <Text style={authScreenStyles.subtitle}>
              Please wait while we validate your reset link…
            </Text>
        </View>
      </View>
    )
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

          <Text style={authScreenStyles.screenTitle}>Reset password</Text>

          <View style={styles.form}>
            <TextField
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter new password"
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
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

            <TextField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              secureTextEntry={!confirmPasswordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              containerStyle={styles.fieldFlush}
              rightAccessory={
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.eyeButton}
                  onPress={() => setConfirmPasswordVisible(!confirmPasswordVisible)} >
                  <View style={styles.eyeButtonCircle}>
                    <Ionicons
                      name={confirmPasswordVisible ? 'eye-off' : 'eye'}
                      size={18}
                      color={colors.semantic.mutedForeground}
                    />
                  </View>
                </Pressable>
              }
            />

            <Button
              title={loading ? 'Updating…' : 'Update password'}
              onPress={handleResetPassword}
              disabled={loading}
              loading={loading}
              variant="default"
              fullWidth
              style={styles.primaryCta}
            />
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
  form: {
    width: '100%',
  },
  fieldFlush: {
    marginBottom: spacing[3],
  },
  primaryCta: {
    marginBottom: spacing[4],
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
