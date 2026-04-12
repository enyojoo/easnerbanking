import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Pressable, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, textStyles, borderRadius, spacing, shadows } from '../theme'
import { ripple } from '../lib/androidRipple'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose: () => void
  action?: {
    label: string
    onPress: () => void
  }
}

export default function Toast({
  message,
  type = 'info',
  duration = 3000,
  onClose,
  action,
}: ToastProps) {
  const insets = useSafeAreaInsets()
  const slideAnim = useRef(new Animated.Value(-100)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start()

    // Auto dismiss
    const timer = setTimeout(() => {
      dismiss()
    }, duration)

    return () => clearTimeout(timer)
  }, [])

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose()
    })
  }

  const getIcon = () => {
    switch (type) {
      case 'success':
        return 'checkmark-circle'
      case 'error':
        return 'close-circle'
      case 'warning':
        return 'warning'
      default:
        return 'information-circle'
    }
  }

  const getColor = () => {
    switch (type) {
      case 'success':
        return colors.success.main
      case 'error':
        return colors.error.main
      case 'warning':
        return colors.warning.main
      default:
        return colors.primary.main
    }
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + spacing[4],
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.toast, { borderLeftColor: getColor() }]}>
        <Ionicons name={getIcon()} size={20} color={getColor()} />
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
        {action && (
          <Pressable
            onPress={() => {
              action.onPress()
              dismiss()
            }}
            style={({ pressed }) => [
              styles.actionButton,
              pressed && Platform.OS === 'ios' && styles.toastHitPressedIOS,
            ]}
            android_ripple={ripple.primaryTint}
          >
            <Text style={[styles.actionText, { color: getColor() }]}>
              {action.label}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={dismiss}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && Platform.OS === 'ios' && styles.toastHitPressedIOS,
          ]}
          android_ripple={ripple.neutral}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={18} color={colors.text.secondary} />
        </Pressable>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing[5],
    right: spacing[5],
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    borderLeftWidth: 4,
    gap: spacing[3],
    ...shadows.lg,
  },
  message: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    flex: 1,
  },
  actionButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  actionText: {
    ...textStyles.labelMedium,
    fontFamily: 'Outfit-SemiBold',
  },
  closeButton: {
    padding: spacing[1],
  },
  toastHitPressedIOS: {
    opacity: 0.7,
  },
})






















