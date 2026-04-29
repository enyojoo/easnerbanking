/**
 * HapticButton - Premium button with haptic feedback and press animation
 * 
 * Features:
 * - Light haptic feedback on press
 * - Scale animation on press
 * - Customizable styles
 */

import React, { useRef, useCallback } from 'react'
import {
  Pressable,
  Platform,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  Text,
  View,
  ActivityIndicator,
  Animated,
} from 'react-native'
import { ripple } from '../../lib/androidRipple'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { textStyles, borderRadius, useThemeColors } from '../../theme'

interface HapticButtonProps {
  children?: React.ReactNode
  title?: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  style?: StyleProp<ViewStyle>
  textStyle?: TextStyle
  hapticStyle?: 'light' | 'medium' | 'heavy' | 'none'
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
  gradient?: readonly [string, string, ...string[]]
}

export default function HapticButton({
  children,
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'md',
  style,
  textStyle,
  hapticStyle = 'light',
  icon,
  iconPosition = 'left',
  fullWidth = false,
  gradient,
}: HapticButtonProps) {
  const colors = useThemeColors()
  const scaleAnim = useRef(new Animated.Value(1)).current

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start()
  }, [scaleAnim])

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start()
  }, [scaleAnim])

  const handlePress = useCallback(async () => {
    if (disabled || loading) return

    // Trigger haptic feedback
    if (hapticStyle !== 'none') {
      const impactStyle = {
        light: Haptics.ImpactFeedbackStyle.Light,
        medium: Haptics.ImpactFeedbackStyle.Medium,
        heavy: Haptics.ImpactFeedbackStyle.Heavy,
      }[hapticStyle]
      
      await Haptics.impactAsync(impactStyle)
    }

    onPress()
  }, [disabled, loading, hapticStyle, onPress])

  const sizeStyles = {
    sm: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      minHeight: 36,
    },
    md: {
      paddingVertical: 14,
      paddingHorizontal: 24,
      minHeight: 48,
    },
    lg: {
      paddingVertical: 18,
      paddingHorizontal: 32,
      minHeight: 56,
    },
  }

  const variantStyles: Record<string, ViewStyle> = {
    primary: {
      backgroundColor: colors.primary.main,
    },
    secondary: {
      backgroundColor: colors.semantic.muted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border.default,
    },
    outline: {
      backgroundColor: colors.semantic.card,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
  }

  const textVariantStyles: Record<string, TextStyle> = {
    primary: {
      color: '#FFFFFF',
    },
    secondary: {
      color: colors.text.primary,
    },
    outline: {
      color: colors.primary.main,
    },
    ghost: {
      color: colors.primary.main,
    },
  }

  const content = (
    <View style={styles.contentContainer}>
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.text.inverse : colors.primary.main}
          size="small"
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <View style={styles.iconLeft}>{icon}</View>
          )}
          {(title || children) && (
            <Text
              style={[
                styles.text,
                textVariantStyles[variant],
                size === 'sm' && styles.textSm,
                size === 'lg' && styles.textLg,
                textStyle,
              ]}
            >
              {title || children}
            </Text>
          )}
          {icon && iconPosition === 'right' && (
            <View style={styles.iconRight}>{icon}</View>
          )}
        </>
      )}
    </View>
  )

  const buttonStyle = [
    styles.button,
    sizeStyles[size],
    variantStyles[variant],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style,
  ]

  /** Opt-in gradient (e.g. on hero contexts) when caller provides explicit colors. */
  const useGradient = !disabled && Boolean(gradient)

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, fullWidth && styles.fullWidth]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        android_ripple={ripple.primaryTint}
        style={({ pressed }) => [
          Platform.OS === 'android' && {
            borderRadius: borderRadius.full,
            overflow: 'hidden' as const,
          },
          fullWidth && { alignSelf: 'stretch' as const },
          pressed && Platform.OS === 'ios' && !disabled && !loading && styles.pressedIOS,
        ]}
      >
        {useGradient && gradient ? (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[buttonStyle, { backgroundColor: undefined }]}
          >
            {content}
          </LinearGradient>
        ) : (
          <View style={buttonStyle}>{content}</View>
        )}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...textStyles.titleMedium,
    fontWeight: '600',
  },
  textSm: {
    fontSize: 14,
  },
  textLg: {
    fontSize: 18,
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  pressedIOS: {
    opacity: 0.92,
  },
})
