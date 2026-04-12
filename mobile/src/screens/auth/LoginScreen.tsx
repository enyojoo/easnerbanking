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
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
import { analytics } from '../../lib/analytics'
import { useThemeColors, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { Button, TextField } from '../../components/ui'

export default function LoginScreen({ navigation }: NavigationProps) {
  const themeColors = useThemeColors()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { signIn } = useAuth()
  const insets = useSafeAreaInsets()

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
    analytics.trackScreenView('Login')
  }, [])

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await signIn(email, password, rememberMe)
      
      if (error) {
        Alert.alert('Login Failed', error.message || 'Invalid credentials')
      } else {
        // No need to navigate - the AppNavigator will automatically show MainStack
        // when user state changes to authenticated
      }
    } catch (error) {
      Alert.alert('Login Failed', 'An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.semantic.background }]}>
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
                    outputRange: [30, 0],
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
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
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
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                containerStyle={styles.fieldFlush}
              />

              {/* Remember Me Checkbox */}
              <View style={styles.rememberMeContainer}>
                <Pressable
                 android_ripple={ripple.neutral}
                  style={styles.checkboxContainer}
                  onPress={async () => {
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
                      <Ionicons name="checkmark" size={16} color={themeColors.text.inverse} />
                    )}
                  </View>
                  <Text style={authScreenStyles.rememberMeText}>Remember me</Text>
                </Pressable>
              </View>

              <Button
                title={isLoading ? 'Signing in…' : 'Sign in'}
                onPress={handleLogin}
                disabled={isLoading}
                loading={isLoading}
                variant="default"
                fullWidth
                style={styles.primaryCta}
              />

              <Pressable
               android_ripple={ripple.neutral}
                style={styles.linkButton}
                onPress={async () => {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.navigate('Register')
              }} >
              <Text style={authScreenStyles.footerLink}>Sign up</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  primaryCta: {
    marginBottom: spacing[4],
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
