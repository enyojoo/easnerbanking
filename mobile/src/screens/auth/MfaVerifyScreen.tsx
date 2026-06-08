import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OtpCodeInput, SectionCard, Button } from '../../components/ui'
import { EasnerAlertSheet } from '../../components/premium'
import { useAuth } from '../../contexts/AuthContext'
import { spacing, textStyles, useThemeColors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { authScreenStyles } from '../../theme/authScreen'
import { useToast } from '../../components/ToastProvider'
import { haptics } from '../../lib/haptics'
import { AuthFlowContainer } from '../../components/layout/AuthFlowContainer'

export default function MfaVerifyScreen() {
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(palette), [palette])
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
    haptics.tap()
    setCancelSheetVisible(true)
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <View style={[styles.scroll, { paddingTop: insets.top + spacing[5], paddingBottom: Math.max(insets.bottom, spacing[6]) }]}>
          <AuthFlowContainer>
          <Text style={[authScreenStyles.screenTitleCompact, { color: palette.text.primary, marginBottom: spacing[2] }]}>
            Two-factor authentication
          </Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code from your authenticator app.
          </Text>

          <SectionCard style={styles.verifyCard}>
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
              <Button
                title={submitting ? 'Verifying…' : 'Continue'}
                onPress={() => void handleSubmit()}
                disabled={submitting || code.replace(/\D/g, '').length !== 6}
                loading={submitting}
                fullWidth
                style={styles.primaryCta}
              />
            </View>
          </SectionCard>

          <Pressable
            android_ripple={ripple.neutral}
            style={styles.secondary}
            onPress={handleBack}
            disabled={submitting}
          >
            <Text style={styles.secondaryText}>Use a different account</Text>
          </Pressable>
          </AuthFlowContainer>
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

function createStyles(p: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.semantic.background,
    },
    keyboard: {
      flex: 1,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: spacing[5],
    },
    subtitle: {
      ...textStyles.bodyMedium,
      color: p.text.secondary,
      marginBottom: spacing[4],
    },
    verifyCard: {
      marginBottom: 0,
    },
    primaryCtaWrap: {
      width: '100%',
      marginTop: spacing[5],
    },
    primaryCta: {
      width: '100%',
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
      ...textStyles.labelMedium,
      color: p.primary.main,
      fontWeight: '600',
    },
  })
}
