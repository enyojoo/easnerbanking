import React from 'react'
import { View, TextInput, StyleSheet } from 'react-native'
import type { PayoutFieldsSchemaHint } from '@easner/shared'
import { recipientFormNeedsEmail, recipientFormNeedsPhone } from '@easner/shared'
import { colors, spacing, textStyles, compactInputMetrics } from '../../theme'

export type PayoutRecipientExtraValues = {
  email: string
  phoneNumber: string
}

type Props = {
  hints: PayoutFieldsSchemaHint | null
  values: PayoutRecipientExtraValues
  onChange: (patch: Partial<PayoutRecipientExtraValues>) => void
  isSubmitting?: boolean
}

/** Email and phone when Noah fields_schema requires them (ZA, …). */
export function PayoutSchemaExtraFields({ hints, values, onChange, isSubmitting }: Props) {
  const needsEmail = recipientFormNeedsEmail(hints)
  const needsPhone = recipientFormNeedsPhone(hints)

  if (!needsEmail && !needsPhone) return null

  return (
    <View style={styles.wrap}>
      {needsPhone ? (
        <TextInput
          style={styles.input}
          value={values.phoneNumber}
          onChangeText={(text) => onChange({ phoneNumber: text })}
          placeholder="Phone number *"
          placeholderTextColor={colors.text.secondary}
          keyboardType="phone-pad"
          editable={!isSubmitting}
        />
      ) : null}
      {needsEmail ? (
        <TextInput
          style={styles.input}
          value={values.email}
          onChangeText={(text) => onChange({ email: text })}
          placeholder="Email *"
          placeholderTextColor={colors.text.secondary}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!isSubmitting}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[3] },
  input: {
    ...textStyles.body,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    color: colors.text.primary,
    backgroundColor: colors.background.primary,
    minHeight: 48,
    ...compactInputMetrics,
  },
})
