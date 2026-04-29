import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Pressable, Platform } from 'react-native'
import {
  CircleCheck,
  CircleX,
  TriangleAlert,
  Info,
  X,
} from 'lucide-react-native'
import { colors, textStyles, borderRadius, spacing, shadows, fontFamily } from '../theme'
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

  const iconColor = getColor()
  const TypeIcon =
    type === 'success'
      ? CircleCheck
      : type === 'error'
        ? CircleX
        : type === 'warning'
          ? TriangleAlert
          : Info

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
        <TypeIcon size={20} color={iconColor} strokeWidth={2} />
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
          <X size={18} color={colors.text.secondary} strokeWidth={2} />
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
    fontFamily: fontFamily.semibold,
  },
  closeButton: {
    padding: spacing[1],
  },
  toastHitPressedIOS: {
    opacity: 0.7,
  },
})






















