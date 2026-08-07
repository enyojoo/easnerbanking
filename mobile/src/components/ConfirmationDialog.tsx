import React from 'react'
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  Modal,
  Animated,
} from 'react-native'
import { CircleAlert, TriangleAlert, Info } from 'lucide-react-native'
import { colors, textStyles, borderRadius, spacing, shadows, fontFamily } from '../theme'
import { ripple } from '../lib/androidRipple'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { USE_NATIVE_DRIVER } from '../lib/animation'

interface ConfirmationDialogProps {
  visible: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmationDialog({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const insets = useSafeAreaInsets()
  const scaleAnim = React.useRef(new Animated.Value(0)).current
  const opacityAnim = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: USE_NATIVE_DRIVER,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start()
    }
  }, [visible])

  const getIconColor = () => {
    switch (type) {
      case 'danger':
        return colors.error.main
      case 'warning':
        return colors.warning.main
      default:
        return colors.primary.main
    }
  }

  const getConfirmButtonColor = () => {
    switch (type) {
      case 'danger':
        return colors.error.main
      case 'warning':
        return colors.warning.main
      default:
        return colors.primary.main
    }
  }

  const iconTint = getIconColor()
  const DialogIcon =
    type === 'danger' ? CircleAlert : type === 'warning' ? TriangleAlert : Info

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: opacityAnim,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.dialog,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
              paddingBottom: insets.bottom + spacing[4],
            },
          ]}
        >
          <View style={styles.iconContainer}>
            <DialogIcon size={48} color={iconTint} strokeWidth={2} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                Platform.OS === 'android' && styles.buttonClip,
                pressed && Platform.OS === 'ios' && styles.dialogBtnPressedIOS,
              ]}
              onPress={onCancel}
              android_ripple={ripple.neutral}
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.confirmButton,
                { backgroundColor: getConfirmButtonColor() },
                Platform.OS === 'android' && styles.buttonClip,
                pressed && Platform.OS === 'ios' && styles.dialogBtnPressedIOS,
              ]}
              onPress={onConfirm}
              android_ripple={ripple.primaryTint}
            >
              <Text style={styles.confirmText}>{confirmText}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  dialog: {
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius['3xl'],
    padding: spacing[6],
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    ...shadows.xl,
  },
  iconContainer: {
    marginBottom: spacing[4],
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  message: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[6],
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing[3],
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonClip: {
    overflow: 'hidden',
  },
  dialogBtnPressedIOS: {
    opacity: 0.85,
  },
  cancelButton: {
    backgroundColor: colors.neutral[100],
  },
  confirmButton: {
    // Color set dynamically
  },
  cancelText: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  confirmText: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontFamily: fontFamily.semibold,
  },
})






















