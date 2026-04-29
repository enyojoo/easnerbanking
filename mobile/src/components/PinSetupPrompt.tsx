import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
} from 'react-native'
import { Lock } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { colors, textStyles, borderRadius, spacing } from '../theme'
import { ripple } from '../lib/androidRipple'

interface PinSetupPromptProps {
  visible: boolean
  onSetup: () => void
  onDismiss: () => void
}

/**
 * Skippable PIN setup prompt for existing users
 */
export default function PinSetupPrompt({ visible, onSetup, onDismiss }: PinSetupPromptProps) {
  const handleSetup = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onSetup()
  }

  const handleDismiss = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onDismiss()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Lock size={48} color={colors.primary.main} strokeWidth={2} />
          </View>

          <Text style={styles.title}>Secure Your Account</Text>
          <Text style={styles.message}>
            Create a 6-digit PIN for quick and easy app access with enhanced security.
          </Text>

          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [
                styles.dismissButton,
                Platform.OS === 'android' && styles.btnClip,
                pressed && Platform.OS === 'ios' && styles.dismissPressedIOS,
              ]}
              onPress={handleDismiss}
              android_ripple={ripple.neutral}
            >
              <Text style={styles.dismissButtonText}>Maybe Later</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.setupButton,
                Platform.OS === 'android' && styles.btnClip,
                pressed && Platform.OS === 'ios' && styles.setupPressedIOS,
              ]}
              onPress={handleSetup}
              android_ripple={ripple.primaryTint}
            >
              <Text style={styles.setupButtonText}>Set Up PIN</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[5],
  },
  container: {
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.xl,
    padding: spacing[6],
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  message: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[6],
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing[3],
    width: '100%',
  },
  dismissButton: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: '600',
  },
  setupButton: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.inverse,
    fontWeight: '600',
  },
  btnClip: {
    overflow: 'hidden',
  },
  dismissPressedIOS: {
    opacity: 0.7,
  },
  setupPressedIOS: {
    opacity: 0.92,
  },
})

