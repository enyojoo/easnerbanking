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
  Animated,
  Keyboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { GoogleOutlineButton, OrDivider } from '../../components/auth/AuthChrome'
import ExternalLinkModal from '../../components/ExternalLinkModal'
import { useExternalLink } from '../../hooks/useExternalLink'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { colors, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { TERMS_URL } from '../../constants/auth'
import { Button, TextField } from '../../components/ui'

export default function RegisterScreen({ navigation }: NavigationProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { signUp } = useAuth()
  const insets = useSafeAreaInsets()
  const termsLink = useExternalLink()

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const formAnim = useRef(new Animated.Value(0)).current

  // Run entrance animations
  useEffect(() => {
    Animated.stagger(100, [
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(formAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start()
  }, [headerAnim, formAnim])

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('Register')
  }, [])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleTermsPress = () => {
    termsLink.openLink(TERMS_URL, 'Terms of Service')
  }

  const validateForm = () => {
    if (!formData.fullName?.trim() || !formData.email || !formData.password) {
      Alert.alert('Error', 'Please fill in all required fields')
      return false
    }

    if (formData.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long')
      return false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      Alert.alert('Error', 'Please enter a valid email address')
      return false
    }

    return true
  }

  const handleGoogleSignUp = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert('Coming soon', 'Google sign-up will be available in a future update.')
  }

  const handleRegister = async () => {
    if (!validateForm()) return

    setLoading(true)
    const { error: signUpError, needsEmailConfirmation } = await signUp(
      formData.email,
      formData.password,
      formData.fullName.trim()
    )

    if (signUpError) {
      setLoading(false)
      Alert.alert('Registration Failed', signUpError.message || 'An error occurred during registration')
      return
    }

    setLoading(false)

    if (needsEmailConfirmation) {
      Alert.alert(
        'Registration Successful',
        'Please check your email to verify your account. After verification, you can sign in to start sending money.',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              })
            },
          },
        ]
      )
    } else {
      Alert.alert('Account ready', 'You are signed in. Continue in the app.', [{ text: 'OK' }])
    }
  }

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={[styles.scrollContainer, { paddingBottom: Math.max(insets.bottom, spacing[5]) }]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.header,
              {
                opacity: headerAnim,
                transform: [{
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-30, 0],
                  })
                }]
              }
            ]}
          >
            <Text style={[authScreenStyles.screenTitle, { marginBottom: spacing[2] }]}>Open an account</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: formAnim,
                transform: [{
                  translateY: formAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [30, 0],
                  })
                }]
              }
            ]}
          >
            <View style={styles.form}>
              <Text style={authScreenStyles.termsIntro}>
                By creating an account you agree to our{' '}
                <Text style={authScreenStyles.termsLink} onPress={handleTermsPress}>
                  Terms
                </Text>
                .
              </Text>

              <GoogleOutlineButton label="Sign up with Google" onPress={handleGoogleSignUp} disabled={loading} />

              <OrDivider />

              <TextField
                label="Full name"
                value={formData.fullName}
                onChangeText={(value) => handleInputChange('fullName', value)}
                placeholder="John Doe"
                autoCapitalize="words"
                editable={!loading}
                containerStyle={styles.fieldFlush}
              />

              <TextField
                label="Email"
                value={formData.email}
                onChangeText={(value) => handleInputChange('email', value)}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                editable={!loading}
                containerStyle={styles.fieldFlush}
              />

              <TextField
                label="Password"
                value={formData.password}
                onChangeText={(value) => handleInputChange('password', value)}
                placeholder="Create a password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                passwordRules="minlength: 6;"
                importantForAutofill="yes"
                underlineColorAndroid="transparent"
                selectionColor={colors.primary.main}
                editable={!loading}
                containerStyle={styles.fieldFlush}
                rightAccessory={
                  <Pressable
                   android_ripple={ripple.neutral}
                    style={styles.eyeButton}
                    onPress={async () => {
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      setShowPassword(!showPassword)
                    }} >
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={colors.semantic.mutedForeground}
                    />
                  </Pressable>
                }
              />

              <Button
                title={loading ? 'Creating account…' : 'Create account'}
                onPress={handleRegister}
                disabled={loading}
                loading={loading}
                variant="default"
                fullWidth
                style={styles.primaryCta}
              />
            </View>
          </Animated.View>

          <View style={[styles.footer, { marginTop: spacing[3] }]}>
            <Text style={authScreenStyles.footerMuted}>Already have an account? </Text>
            <Pressable
             android_ripple={ripple.neutral}
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                })
              }} >
              <Text style={authScreenStyles.footerLink}>Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ExternalLinkModal
        visible={termsLink.isVisible}
        url={termsLink.url}
        title={termsLink.title}
        onClose={termsLink.closeLink}
      />
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: spacing[5],
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing[5],
    marginTop: spacing[6],
  },
  formContainer: {
    marginBottom: spacing[4],
  },
  form: {
    width: '100%',
  },
  fieldFlush: {
    marginBottom: spacing[3],
  },
  primaryCta: {
    marginBottom: 0,
  },
  eyeButton: {
    padding: spacing[3],
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
