import React from 'react'
import { TextInput, View, StyleSheet, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native'
import { borderRadius, spacing, textStyles, useThemeColors } from '../../theme'

type PremiumTextFieldProps = TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>
  hasError?: boolean
}

export default function PremiumTextField({
  containerStyle,
  hasError = false,
  style,
  ...props
}: PremiumTextFieldProps) {
  const palette = useThemeColors()

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.semantic.card,
          borderColor: hasError ? palette.error.main : palette.border.default,
        },
        containerStyle,
      ]}
    >
      <TextInput
        {...props}
        placeholderTextColor={palette.text.tertiary}
        selectionColor={palette.primary.main}
        style={[styles.input, { color: palette.text.primary }, style]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  input: {
    ...textStyles.textInputSingleLine,
    paddingVertical: 0,
  },
})

