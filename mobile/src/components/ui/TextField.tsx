import React from 'react'
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native'
import { colors, textStyles, borderRadius, spacing } from '../../theme'

export type TextFieldProps = {
  label: string
  error?: string
  containerStyle?: StyleProp<ViewStyle>
  rightAccessory?: React.ReactNode
} & Omit<TextInputProps, 'style'> & {
  style?: TextInputProps['style']
}

const FIELD_MIN_H = 52

/** Label + input + optional error — pill radius (auth parity with premium fields). */
export function TextField({
  label,
  error,
  containerStyle,
  rightAccessory,
  editable = true,
  ...inputProps
}: TextFieldProps) {
  const borderColor = error ? colors.error.main : colors.semantic.border

  if (rightAccessory) {
    return (
      <View style={[styles.container, containerStyle]}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.row, { borderColor }]}>
          <TextInput
            editable={editable}
            placeholderTextColor={colors.semantic.mutedForeground}
            selectionColor={colors.primary.main}
            {...inputProps}
            style={[styles.inputInRow, inputProps.style]}
          />
          {rightAccessory}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    )
  }

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        editable={editable}
        placeholderTextColor={colors.semantic.mutedForeground}
        selectionColor={colors.primary.main}
        {...inputProps}
        style={[styles.input, { borderColor }, inputProps.style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[4],
  },
  label: {
    ...textStyles.labelLarge,
    color: colors.semantic.foreground,
    marginBottom: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.background,
    minHeight: FIELD_MIN_H,
    paddingRight: spacing[2],
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.textInputSingleLine,
    color: colors.semantic.foreground,
    backgroundColor: colors.semantic.background,
    minHeight: FIELD_MIN_H,
    textAlignVertical: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
      ios: {
        paddingVertical: 11,
      },
    }),
  },
  inputInRow: {
    flex: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...textStyles.textInputSingleLine,
    color: colors.semantic.foreground,
    borderWidth: 0,
    minHeight: FIELD_MIN_H - 2,
    backgroundColor: 'transparent',
    textAlignVertical: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
      ios: {
        paddingVertical: 11,
      },
    }),
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    marginTop: spacing[1],
  },
})
