import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  NG_LOCAL_VERIFICATION_COPY,
  isValidNgLocalIdNumber,
  ngSupplementInlinePrompt,
  type NgLocalIdType,
} from '@easner/shared'
import { WebAwareModal } from '../WebAwareModal'
import { colors, spacing, textStyles, fontSize, lineHeight as lineHeightScale } from '../../theme'
import { haptics } from '../../lib/haptics'
import { apiPatch } from '../../lib/apiClient'

type Props = {
  missingType: NgLocalIdType
  style?: object
  onSaved?: () => void
}

export function NgLocalVerificationNotice({ missingType, style, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = NG_LOCAL_VERIFICATION_COPY
  const fieldLabel = useMemo(
    () => (missingType === 'NIN' ? copy.fieldLabelNin : copy.fieldLabelBvn),
    [missingType, copy],
  )

  async function save() {
    setError(null)
    if (!isValidNgLocalIdNumber(value)) {
      setError('Enter an 11-digit number')
      return
    }
    setSaving(true)
    try {
      const res = await apiPatch('/api/compliance/ng-local-verification', {
        ngLocalIdType: missingType,
        ngLocalIdNumber: value.trim(),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data.error === 'string' ? data.error : 'Save failed')
        return
      }
      haptics.success()
      setOpen(false)
      setValue('')
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Text style={[styles.inline, style]}>
        {ngSupplementInlinePrompt(missingType)}
        <Text
          style={styles.link}
          onPress={() => {
            haptics.tap()
            setOpen(true)
          }}
        >
          {copy.inlineLink}
        </Text>
      </Text>
      <WebAwareModal visible={open} onRequestClose={() => setOpen(false)} compact>
        <View style={styles.modalPanel}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.intro}>{copy.introBoth}</Text>
          <Text style={styles.label}>{fieldLabel}</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={11}
            value={value}
            onChangeText={(t) => setValue(t.replace(/\D/g, '').slice(0, 11))}
            placeholder="00000000000"
            placeholderTextColor={colors.text.tertiary}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={styles.saveBtn}
            disabled={saving}
            onPress={() => {
              haptics.tap()
              void save()
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>{copy.save}</Text>
            )}
          </Pressable>
        </View>
      </WebAwareModal>
    </>
  )
}

const styles = StyleSheet.create({
  inline: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing[3],
  },
  link: {
    color: colors.primary.main,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  modalPanel: {
    padding: spacing[5],
  },
  title: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  intro: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    marginBottom: spacing[4],
    lineHeight: Math.round(fontSize.sm * lineHeightScale.relaxed),
  },
  label: {
    ...textStyles.bodyMedium,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 10,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.status.error,
    marginBottom: spacing[2],
  },
  saveBtn: {
    backgroundColor: colors.primary.main,
    borderRadius: 10,
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  saveBtnText: {
    ...textStyles.bodyMedium,
    color: '#fff',
    fontWeight: '600',
  },
})
