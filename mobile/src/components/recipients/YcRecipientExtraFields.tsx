import React from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import type { RecipientYcMetadata, YcCorridorSchemaHint } from '@easner/shared'
import { colors, spacing, textStyles, compactInputMetrics, fontFamily } from '../../theme'

type Props = {
  schema: YcCorridorSchemaHint | null
  values: RecipientYcMetadata
  onChange: (patch: Partial<RecipientYcMetadata>) => void
  fieldErrors?: Record<string, string>
  isSubmitting?: boolean
}

/** Yellowcard LatAm extras — Pix type, CUIT, COP ID fields. */
export function YcRecipientExtraFields({
  schema,
  values,
  onChange,
  fieldErrors,
  isSubmitting,
}: Props) {
  const fields = schema?.extra_fields ?? []
  if (!fields.length) return null

  return (
    <View style={styles.wrap}>
      {fields.map((field) => {
        const key = field.key
        if (key === 'account_number') return null
        const value = String(values[key as keyof RecipientYcMetadata] ?? '')
        const err = fieldErrors?.[key]

        if (field.kind === 'select' && field.options?.length) {
          return (
            <View key={key}>
              <Text style={styles.label}>
                {field.label}
                {field.required ? ' *' : ''}
              </Text>
              <View style={styles.chips}>
                {field.options.map((opt) => {
                  const active = value === opt.value
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => onChange({ [key]: opt.value } as Partial<RecipientYcMetadata>)}
                      disabled={isSubmitting}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                    </Pressable>
                  )
                })}
              </View>
              {err ? <Text style={styles.errorText}>{err}</Text> : null}
            </View>
          )
        }

        return (
          <View key={key}>
            <TextInput
              style={[styles.input, err && styles.inputError]}
              value={value}
              onChangeText={(text) => onChange({ [key]: text } as Partial<RecipientYcMetadata>)}
              placeholder={`${field.label}${field.required ? ' *' : ''}`}
              placeholderTextColor={colors.text.secondary}
              keyboardType={field.digits ? 'number-pad' : 'default'}
              editable={!isSubmitting}
            />
            {err ? <Text style={styles.errorText}>{err}</Text> : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[3] },
  label: { ...textStyles.caption, color: colors.text.secondary, marginBottom: spacing[2] },
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
  inputError: { borderColor: colors.status.error },
  errorText: { ...textStyles.caption, color: colors.status.error, marginTop: spacing[1] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 999,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.background.primary,
  },
  chipActive: {
    borderColor: colors.primary.main,
    backgroundColor: colors.primary[50],
  },
  chipText: { ...textStyles.caption, color: colors.text.secondary },
  chipTextActive: { color: colors.primary.main, fontFamily: fontFamily.medium },
})
