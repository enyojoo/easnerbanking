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
import { Button, TextField } from '../../components/ui'
import { GoogleOutlineButton, OrDivider } from '../../components/auth/AuthChrome'
import { useExternalLink } from '../../hooks/useExternalLink'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { colors, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { AUTH_INITIAL_MODE_KEY, TERMS_URL } from '../../constants/auth'

/**
 * Layout mirrors business auth pages:
 * - /auth/layout: logo centered, then card (max-w-md)
 * - /auth/login: Google → Or → email/password → forgot → Sign in → footer
 * - /auth/signup: terms → Google → Or → name/email/password → Create account → footer
 * Mobile switches login/signup via footer links (separate routes on web).
 * Form content sits on the page background — no inset card frame (unlike web’s bordered card).
 */
type AuthMode = 'login' | 'signup'

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
  const { signIn, signUp } = useAuth()

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
  }

  const handleBack = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (modeStack.length > 1) {
      setEmail('')
      setPassword('')
      setFullName('')
      setPasswordVisible(false)
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

  const handleSubmit = async () => {
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
          Alert.alert(
            'Check your email',
            'We sent a confirmation link. After verifying, you can sign in.',
            [{ text: 'OK', onPress: () => switchMode('login') }]
          )
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
    Alert.alert('Coming soon', 'Google sign-in will be available in a future update.')
  }

  const isLogin = mode === 'login'

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
            {isLogin ? 'Welcome back' : 'Open an account'}
          </Text>

          <View style={styles.form}>
            {!isLogin && (
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

            <GoogleOutlineButton
              label={isLogin ? 'Sign in with Google' : 'Sign up with Google'}
              onPress={handleGoogleAuth}
              disabled={isLoading}
            />

            <OrDivider />

            {!isLogin && (
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

            <Button
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
              loading={isLoading}
              variant="default"
              fullWidth
              style={styles.primaryCta}
            />

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
