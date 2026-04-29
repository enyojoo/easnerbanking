import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OtpCodeInput } from '../../components/ui'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'
import { EasnerAlertSheet } from '../../components/premium'
import { useAuth } from '../../contexts/AuthContext'
import { colors, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { useToast } from '../../components/ToastProvider'

export default function MfaVerifyScreen() {
  const insets = useSafeAreaInsets()
  const { verifyMfa, cancelMfaSignIn } = useAuth()
  const { showError, showWarning } = useToast()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelSheetVisible, setCancelSheetVisible] = useState(false)

  const handleSubmit = async () => {
    const digits = code.replace(/\D/g, '')
    if (digits.length !== 6) {
      showWarning('Enter the 6-digit code from your authenticator app.')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await verifyMfa(digits)
      if (error) {
        showError(error.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setCancelSheetVisible(true)
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        // Keep the screen static; the OTP row is positioned so the keyboard won't cover it.
        // Only apply iOS padding for safe insets.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <View style={[styles.scroll, { paddingTop: insets.top + spacing[5], paddingBottom: Math.max(insets.bottom, spacing[6]) }]}>
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

          <View style={styles.primaryCtaWrap}>
            <GlossyPrimaryButton
              title={submitting ? 'Verifying…' : 'Continue'}
              onPress={() => void handleSubmit()}
              disabled={submitting || code.replace(/\D/g, '').length !== 6}
              style={styles.glossyCta}
            />
          </View>

          <Pressable
           android_ripple={ripple.neutral}
            style={styles.secondary}
            onPress={handleBack} disabled={submitting}
          >
            <Text style={styles.secondaryText}>Use a different account</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <EasnerAlertSheet
        visible={cancelSheetVisible}
        onDismiss={() => setCancelSheetVisible(false)}
        title="Cancel sign-in?"
        message="You will need your email and password to sign in again."
        primaryLabel="Sign out"
        onPrimary={() => {
          setCancelSheetVisible(false)
          void cancelMfaSignIn()
        }}
        secondaryLabel="Stay"
        onSecondary={() => setCancelSheetVisible(false)}
      />
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
  subtitleMargin: {
    marginBottom: spacing[6],
  },
  primaryCtaWrap: {
    width: '100%',
    marginTop: spacing[5],
  },
  glossyCta: {
    width: '100%',
    flexGrow: 0,
    minHeight: 52,
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
