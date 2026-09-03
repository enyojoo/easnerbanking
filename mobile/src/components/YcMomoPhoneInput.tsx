import React, { useEffect, useState } from 'react'
import { StyleSheet, View, Text, TextInput, type TextInputProps } from 'react-native'
import { PostHogMaskView } from 'posthog-react-native'
import {
  buildYcMomoPhoneFromLocal,
  parseYcMomoLocalPhone,
  resolveYcMomoCallingCodeLabel,
  sanitizeYcMomoLocalPhoneInput,
} from '@easner/shared'
import { colors, textStyles, borderRadius, spacing } from '../theme'

type Props = {
  countryCode: string
  value: string
  onChange: (internationalPhone: string) => void
  placeholder?: string
  style?: TextInputProps['style']
}

export function YcMomoPhoneInput({
  countryCode,
  value,
  onChange,
  placeholder = '712345678',
  style,
}: Props) {
  const prefix = resolveYcMomoCallingCodeLabel(countryCode) ?? '+'
  const [localPhone, setLocalPhone] = useState(() => parseYcMomoLocalPhone(value, countryCode))

  useEffect(() => {
    setLocalPhone(parseYcMomoLocalPhone(value, countryCode))
  }, [value, countryCode])

  const onLocalChange = (text: string) => {
    const cleaned = sanitizeYcMomoLocalPhoneInput(text)
    setLocalPhone(cleaned)
    onChange(buildYcMomoPhoneFromLocal(cleaned, countryCode))
  }

  return (
    <PostHogMaskView style={styles.row}>
      <View style={styles.prefix}>
        <Text style={styles.prefixText}>{prefix}</Text>
      </View>
      <TextInput
        value={localPhone}
        onChangeText={onLocalChange}
        keyboardType="phone-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.text.secondary}
        style={[styles.input, style]}
        autoComplete="tel-national"
      />
    </PostHogMaskView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  prefix: {
    minWidth: 64,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.neutral[100],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.light,
  },
  prefixText: {
    ...textStyles.body,
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  input: {
    flex: 1,
    ...textStyles.body,
    color: colors.text.primary,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.light,
    backgroundColor: colors.semantic.card,
  },
})
