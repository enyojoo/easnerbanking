import React, { useState, type ReactNode } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { brazilPixKeyIsTaxId, type RecipientYcMetadata, type YcCorridorSchemaHint, type YcRecipientFieldDef } from '@easner/shared'
import { colors, spacing, textStyles, compactInputMetrics, fontFamily, borderRadius } from '../../theme'

type Props = {
  schema?: YcCorridorSchemaHint | null
  fields?: YcRecipientFieldDef[]
  values: RecipientYcMetadata
  onChange: (patch: Partial<RecipientYcMetadata>) => void
  fieldErrors?: Record<string, string>
  isSubmitting?: boolean
  /** When Pix type is present, rendered in the same row (larger column). */
  accountNumber?: ReactNode
}

function isPixKeyTypeField(field: YcRecipientFieldDef): boolean {
  return field.key === 'pix_key_type'
}

/** Map corridor extras onto recipient form state keys. */
export function formPatchFromCorridorExtras(patch: Partial<RecipientYcMetadata>): {
  ycPixKeyType?: string
  ycTaxId?: string
  ycCuit?: string
  ycIdentificationType?: string
  ycIdentificationNumber?: string
  ycAccountType?: string
  ycIfsc?: string
  ycBankCode?: string
  ycBranchCode?: string
  ycGridRegion?: string
} {
  return {
    ...(patch.pix_key_type != null ? { ycPixKeyType: patch.pix_key_type } : {}),
    ...(patch.tax_id != null ? { ycTaxId: patch.tax_id } : {}),
    ...(patch.cuit != null ? { ycCuit: patch.cuit } : {}),
    ...(patch.identification_type != null ? { ycIdentificationType: patch.identification_type } : {}),
    ...(patch.identification_number != null ? { ycIdentificationNumber: patch.identification_number } : {}),
    ...(patch.account_type != null ? { ycAccountType: patch.account_type } : {}),
    ...(patch.ifsc != null ? { ycIfsc: patch.ifsc } : {}),
    ...(patch.bank_code != null ? { ycBankCode: patch.bank_code } : {}),
    ...(patch.branch_code != null ? { ycBranchCode: patch.branch_code } : {}),
    ...(patch.grid_region != null ? { ycGridRegion: patch.grid_region } : {}),
  }
}

/** Corridor extras (Grid IFSC/bank_code, YC Pix/CUIT, …). */
export function CorridorRecipientExtraFields({
  schema,
  fields,
  values,
  onChange,
  fieldErrors,
  isSubmitting,
  accountNumber,
}: Props) {
  const list = fields ?? schema?.extra_fields ?? []
  const pixTypeField = list.find(isPixKeyTypeField)
  const hideTaxId = brazilPixKeyIsTaxId(String(values.pix_key_type ?? ''))
  const otherFields = list.filter((field) => {
    if (field.key === 'account_number' || isPixKeyTypeField(field)) return false
    if (field.key === 'tax_id' && hideTaxId) return false
    return true
  })
  if (!list.length && !accountNumber) return null

  return (
    <View style={styles.wrap}>
      {pixTypeField && accountNumber ? (
        <View style={styles.pixRow}>
          <View style={styles.pixTypeCol}>
            <PixTypeSelect
              field={pixTypeField}
              value={String(values.pix_key_type ?? '')}
              error={fieldErrors?.pix_key_type}
              disabled={isSubmitting}
              onChange={(value) => onChange({ pix_key_type: value })}
            />
          </View>
          <View style={styles.pixKeyCol}>{accountNumber}</View>
        </View>
      ) : (
        <>
          {accountNumber}
          {pixTypeField ? (
            <PixTypeSelect
              field={pixTypeField}
              value={String(values.pix_key_type ?? '')}
              error={fieldErrors?.pix_key_type}
              disabled={isSubmitting}
              onChange={(value) => onChange({ pix_key_type: value })}
            />
          ) : null}
        </>
      )}
      {otherFields.map((field) => {
        const key = field.key
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
              placeholder={`${field.label}${field.required || field.key === 'tax_id' ? ' *' : ''}`}
              placeholderTextColor={colors.text.secondary}
              keyboardType={field.digits || field.key === 'tax_id' ? 'number-pad' : 'default'}
              editable={!isSubmitting}
            />
            {err ? <Text style={styles.errorText}>{err}</Text> : null}
          </View>
        )
      })}
    </View>
  )
}

function PixTypeSelect({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: YcRecipientFieldDef
  value: string
  error?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = field.options?.find((opt) => opt.value === value)
  const label = selected?.label || `Select ${field.label.toLowerCase()}`

  return (
    <View style={styles.pixTypeWrap}>
      <Text style={styles.label}>
        {field.label}
        {field.required ? ' *' : ''}
      </Text>
      <Pressable
        style={[styles.selectTrigger, error && styles.inputError]}
        onPress={() => setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <Text
          style={[styles.selectValue, !selected && styles.selectPlaceholder]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <ChevronDown size={16} color={colors.text.secondary} />
      </Pressable>
      {open ? (
        <View style={styles.selectMenu}>
          {field.options?.map((opt) => {
            const active = value === opt.value
            return (
              <Pressable
                key={opt.value}
                style={[styles.selectItem, active && styles.selectItemActive]}
                onPress={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                disabled={disabled}
              >
                <Text style={[styles.selectItemText, active && styles.selectItemTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  )
}

/** @deprecated Use CorridorRecipientExtraFields */
export const YcRecipientExtraFields = CorridorRecipientExtraFields

const styles = StyleSheet.create({
  wrap: { gap: spacing[3] },
  pixRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    zIndex: 20,
  },
  pixTypeCol: {
    width: 118,
    zIndex: 21,
  },
  pixKeyCol: {
    flex: 1,
    minWidth: 0,
  },
  pixTypeWrap: { zIndex: 21 },
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
    backgroundColor: colors.neutral[50],
  },
  chipText: { ...textStyles.caption, color: colors.text.secondary },
  chipTextActive: { color: colors.primary.main, fontFamily: fontFamily.medium },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[1],
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.frame.background,
  },
  selectValue: {
    ...textStyles.body,
    color: colors.text.primary,
    flex: 1,
  },
  selectPlaceholder: { color: colors.text.secondary },
  selectMenu: {
    marginTop: spacing[1],
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    backgroundColor: colors.background.primary,
    overflow: 'hidden',
  },
  selectItem: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  selectItemActive: {
    backgroundColor: colors.neutral[50],
  },
  selectItemText: { ...textStyles.body, color: colors.text.primary },
  selectItemTextActive: { color: colors.primary.main, fontFamily: fontFamily.medium },
})
