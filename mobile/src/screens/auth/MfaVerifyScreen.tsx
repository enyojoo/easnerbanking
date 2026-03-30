import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, OtpCodeInput } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { colors, spacing } from '../../theme'
import { authScreenStyles } from '../../theme/authScreen'

export default function MfaVerifyScreen() {
  const insets = useSafeAreaInsets()
  const { verifyMfa, cancelMfaSignIn } = useAuth()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    const digits = code.replace(/\D/g, '')
    if (digits.length !== 6) {
      Alert.alert('Two-factor authentication', 'Enter the 6-digit code from your authenticator app.')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await verifyMfa(digits)
      if (error) {
        Alert.alert('Two-factor authentication', error.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert('Cancel sign-in?', 'You will need your email and password to sign in again.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void cancelMfaSignIn()
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + spacing[3],
              paddingBottom: Math.max(insets.bottom, spacing[6]),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <View style={styles.backPlaceholder} />
          </View>

          <Text style={authScreenStyles.screenTitle}>Two-factor authentication</Text>
          <Text style={[authScreenStyles.subtitle, styles.subtitleMargin]}>
            Enter the 6-digit code from your authenticator app.
          </Text>

          <View
            style={submitting ? styles.otpVerifyLock : undefined}
            pointerEvents={submitting ? 'none' : 'auto'}
          >
            <OtpCodeInput
              id="mfa-signin-verify-code"
              label="6-digit code"
              value={code}
              onChange={setCode}
              autoFocus
              disabled={submitting}
            />
          </View>

          <Button
            title="Continue"
            fullWidth
            onPress={() => void handleSubmit()}
            disabled={submitting || code.replace(/\D/g, '').length !== 6}
            loading={submitting}
          />

          <TouchableOpacity
            style={styles.secondary}
            onPress={handleBack}
            activeOpacity={0.7}
            disabled={submitting}
          >
            <Text style={styles.secondaryText}>Use a different account</Text>
          </TouchableOpacity>
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
  keyboard: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing[5],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  backButton: {
    padding: spacing[2],
    marginLeft: -spacing[2],
  },
  backPlaceholder: {
    width: 40,
  },
  subtitleMargin: {
    marginBottom: spacing[6],
  },
  otpVerifyLock: {
    opacity: 0.8,
  },
  secondary: {
    marginTop: spacing[5],
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  secondaryText: {
    ...authScreenStyles.subtitle,
    color: colors.primary.main,
    fontWeight: '600',
  },
})
