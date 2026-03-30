import React from 'react'
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  StyleProp,
} from 'react-native'
import { colors, textStyles, borderRadius, spacing } from '../../theme'

const MIN_HEIGHT = {
  sm: 36,
  md: 44,
} as const

export type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md'

export type ButtonProps = {
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: ButtonVariant
  size?: ButtonSize
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  fullWidth?: boolean
}

export function Button({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'default',
  size = 'md',
  style,
  textStyle,
  fullWidth,
}: ButtonProps) {
  const minH = MIN_HEIGHT[size]
  const padV = size === 'sm' ? spacing[2] : spacing[3]
  const padH = size === 'sm' ? spacing[4] : spacing[5]

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { minHeight: minH, paddingVertical: padV, paddingHorizontal: padH },
        variant === 'default' && styles.defaultBg,
        variant === 'outline' && styles.outlineBg,
        variant === 'ghost' && styles.ghostBg,
        variant === 'destructive' && styles.destructiveBg,
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator
            color={
              variant === 'outline' || variant === 'ghost'
                ? colors.primary.main
                : colors.text.inverse
            }
            size="small"
          />
          <Text
            style={[
              size === 'sm' ? textStyles.titleSmall : textStyles.titleMedium,
              variant === 'default' && styles.textDefault,
              variant === 'outline' && styles.textOutline,
              variant === 'ghost' && styles.textGhost,
              variant === 'destructive' && styles.textDestructive,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </View>
      ) : (
        <Text
          style={[
            size === 'sm' ? textStyles.titleSmall : textStyles.titleMedium,
            variant === 'default' && styles.textDefault,
            variant === 'outline' && styles.textOutline,
            variant === 'ghost' && styles.textGhost,
            variant === 'destructive' && styles.textDestructive,
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  base: {
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  defaultBg: {
    backgroundColor: colors.primary.main,
  },
  outlineBg: {
    backgroundColor: colors.semantic.background,
    borderWidth: 1,
    borderColor: colors.semantic.border,
  },
  ghostBg: {
    backgroundColor: 'transparent',
  },
  destructiveBg: {
    backgroundColor: colors.semantic.destructive,
  },
  pressed: {
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.5,
  },
  textDefault: {
    color: colors.text.inverse,
    fontWeight: '600',
  },
  textOutline: {
    color: colors.semantic.foreground,
    fontWeight: '600',
  },
  textGhost: {
    color: colors.primary.main,
    fontWeight: '600',
  },
  textDestructive: {
    color: colors.semantic.destructiveForeground,
    fontWeight: '600',
  },
})
