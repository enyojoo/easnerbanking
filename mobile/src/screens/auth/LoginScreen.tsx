import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native'
import { Check } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { useThemeColors, borderRadius, spacing, motion } from '../../theme'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { TextField } from '../../components/ui'
import { useToast } from '../../components/ToastProvider'
import { haptics } from '../../lib/haptics'
import KeyboardAwareScreen from '../../components/KeyboardAwareScreen'

export default function LoginScreen({ navigation }: NavigationProps) {
  const themeColors = useThemeColors()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { signIn } = useAuth()
  const { showError } = useToast()
  const insets = useSafeAreaInsets()

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const formAnim = useRef(new Animated.Value(0)).current

  // Run entrance animations
  useCalmParallelEnterWhen(true, headerAnim, formAnim)

  // Track screen view
  useEffect(() => {
    analytics.trackScreenView('Login')
  }, [])

  const handleLogin = async () => {
    if (!email || !password) {
      showError('Please fill in all fields')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await signIn(email, password, rememberMe)
      
      if (error) {
        showError(error.message || 'Invalid credentials')
      } else {
        // No need to navigate - the AppNavigator will automatically show MainStack
        // when user state changes to authenticated
      }
    } catch (error) {
      showError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.semantic.background }]}>
      <KeyboardAwareScreen
        style={styles.keyboardContainer}
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
                    outputRange: [-motion.screenEnterTranslateY, 0],
                  })
                }]
              }
            ]}
          >
            <Text style={[authScreenStyles.screenTitle, { marginBottom: spacing[2] }]}>Welcome back</Text>
            <Text style={authScreenStyles.subtitle}>Sign in to your account</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: formAnim,
                transform: [{
                  translateY: formAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [motion.screenEnterTranslateY, 0],
                  })
                }]
              }
            ]}
          >
            <View style={styles.form}>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                textContentType="emailAddress"
                autoComplete="email"
                containerStyle={styles.fieldFlush}
              />

              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                textContentType="password"
                autoComplete="password"
                onSubmitEditing={handleLogin}
                containerStyle={styles.fieldFlush}
              />

              {/* Remember Me Checkbox */}
              <View style={styles.rememberMeContainer}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.checkboxContainer}
                  onPress={async () => {
                    haptics.tap()
                    setRememberMe(!rememberMe)
                  }} >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: themeColors.semantic.border,
                        backgroundColor: rememberMe ? themeColors.primary.main : themeColors.semantic.background,
                      },
                      rememberMe && { borderColor: themeColors.primary.main },
                    ]}
                  >
                    {rememberMe && (
                      <Check size={16} color={themeColors.text.inverse} strokeWidth={2.5} />
                    )}
                  </View>
                  <Text style={authScreenStyles.rememberMeText}>Remember me</Text>
                </Pressable>
              </View>

              <View style={styles.primaryCtaWrap}>
                <GlossyPrimaryButton
                  title={isLoading ? 'Signing in…' : 'Sign in'}
                  onPress={handleLogin}
                  disabled={isLoading}
                  style={styles.glossyCta}
                />
              </View>

              <Pressable
               android_ripple={ripple.neutral}
                style={styles.linkButton}
                onPress={async () => {
                  haptics.tap()
                  navigation.navigate('ForgotPassword')
                }} >
                <Text style={authScreenStyles.linkText}>Forgot password?</Text>
              </Pressable>
            </View>
          </Animated.View>

          <View style={styles.footer}>
            <Text style={authScreenStyles.footerMuted}>{"Don't have an account? "}</Text>
            <Pressable 
             android_ripple={ripple.neutral} 
              onPress={async () => {
                haptics.tap()
                navigation.navigate('Register')
              }} >
              <Text style={authScreenStyles.footerLink}>Sign up</Text>
            </Pressable>
          </View>
        </KeyboardAwareScreen>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing[5],
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing[10],
  },
  formContainer: {
    marginBottom: spacing[8],
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
  rememberMeContainer: {
    marginBottom: spacing[5],
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
