import React from 'react'
import { View, Pressable, StyleSheet, Text, ActivityIndicator, Platform, type ViewStyle, type StyleProp } from 'react-native'
import { PressableScale } from 'pressto'
import { LinearGradient } from 'expo-linear-gradient'
import { textStyles, borderRadius, useThemeColors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'

interface HapticButtonProps {
  children?: React.ReactNode
  title?: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  style?: StyleProp<ViewStyle>
  textStyle?: object
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

  const handlePress = () => {
    if (disabled || loading) return
    if (hapticStyle !== 'none') {
      const fn = { light: haptics.tap, medium: haptics.medium, heavy: haptics.heavy }[hapticStyle]
      fn()
    }
    onPress()
  }

  const sizeStyles = {
    sm: { paddingVertical: 10, paddingHorizontal: 16, minHeight: 36 },
    md: { paddingVertical: 14, paddingHorizontal: 24, minHeight: 48 },
    lg: { paddingVertical: 18, paddingHorizontal: 32, minHeight: 56 },
  }

  const variantStyles: Record<string, ViewStyle> = {
    primary: { backgroundColor: colors.primary.main },
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
    ghost: { backgroundColor: 'transparent' },
  }

  const textVariantStyles: Record<string, object> = {
    primary: { color: '#FFFFFF' },
    secondary: { color: colors.text.primary },
    outline: { color: colors.primary.main },
    ghost: { color: colors.primary.main },
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
          {icon && iconPosition === 'left' ? <View style={styles.iconLeft}>{icon}</View> : null}
          {(title || children) ? (
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
          ) : null}
          {icon && iconPosition === 'right' ? <View style={styles.iconRight}>{icon}</View> : null}
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

  const useGradient = !disabled && Boolean(gradient)

  return (
    <PressableScale
      onPress={handlePress}
      disabled={disabled || loading}
      style={[fullWidth && styles.fullWidth, Platform.OS === 'android' && styles.androidClip]}
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
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: { width: '100%' },
  androidClip: { borderRadius: borderRadius.full, overflow: 'hidden' },
  disabled: { opacity: 0.5 },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { ...textStyles.titleMedium, fontWeight: '600' },
  textSm: { fontSize: 14 },
  textLg: { fontSize: 18 },
  iconLeft: { marginRight: 8 },
  iconRight: { marginLeft: 8 },
})
