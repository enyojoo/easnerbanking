import React from 'react'
import { View, Text, TextInput, StyleSheet } from 'react-native'
import type { PayoutFieldsSchemaHint } from '@easner/shared'
import { recipientFormNeedsAddress, recipientFormNeedsEmail } from '@easner/shared'
import { colors, spacing, textStyles } from '../../theme'

export type PayoutRecipientExtraValues = {
  email: string
  addressLine1: string
  city: string
  state: string
  postalCode: string
}

type Props = {
  hints: PayoutFieldsSchemaHint | null
  currencyCode: string
  countryCode?: string
  values: PayoutRecipientExtraValues
  onChange: (patch: Partial<PayoutRecipientExtraValues>) => void
  isSubmitting?: boolean
}

/** Email + holder address when Noah fields_schema requires them (ZA, CA, …). */
export function PayoutSchemaExtraFields({
  hints,
  currencyCode,
  countryCode,
  values,
  onChange,
  isSubmitting,
}: Props) {
  const needsEmail = recipientFormNeedsEmail(hints)
  const needsAddress =
    recipientFormNeedsAddress({ hints, currencyCode }) && countryCode !== 'US'

  if (!needsEmail && !needsAddress) return null

  return (
    <View style={styles.wrap}>
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
      {needsAddress ? (
        <>
          <TextInput
            style={styles.input}
            value={values.addressLine1}
            onChangeText={(text) => onChange({ addressLine1: text })}
            placeholder="Street address *"
            placeholderTextColor={colors.text.secondary}
            autoCapitalize="words"
            editable={!isSubmitting}
          />
          <TextInput
            style={styles.input}
            value={values.city}
            onChangeText={(text) => onChange({ city: text })}
            placeholder="City *"
            placeholderTextColor={colors.text.secondary}
            autoCapitalize="words"
            editable={!isSubmitting}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.half]}
              value={values.state}
              onChangeText={(text) => onChange({ state: text })}
              placeholder="State / region *"
              placeholderTextColor={colors.text.secondary}
              editable={!isSubmitting}
            />
            <TextInput
              style={[styles.input, styles.half]}
              value={values.postalCode}
              onChangeText={(text) => onChange({ postalCode: text })}
              placeholder="Postal code *"
              placeholderTextColor={colors.text.secondary}
              editable={!isSubmitting}
            />
          </View>
        </>
      ) : null}
      {needsEmail || needsAddress ? (
        <Text style={styles.hint}>Required for payouts to this country.</Text>
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
  },
  row: { flexDirection: 'row', gap: spacing[3] },
  half: { flex: 1 },
  hint: { ...textStyles.caption, color: colors.text.secondary },
})
