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
  /** IDs still needed – one field each, or both when neither is on file. */
  missingTypes: NgLocalIdType[]
  style?: object
  onSaved?: () => void
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11)
}

export function NgLocalVerificationNotice({ missingTypes, style, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [nin, setNin] = useState('')
  const [bvn, setBvn] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = NG_LOCAL_VERIFICATION_COPY

  const needNin = missingTypes.includes('NIN')
  const needBvn = missingTypes.includes('BVN')
  const needBoth = needNin && needBvn
  const singleType = !needBoth ? missingTypes[0] : null

  const intro = useMemo(
    () => (needBoth ? copy.introBoth : copy.introOne),
    [needBoth, copy],
  )

  async function save() {
    setError(null)
    if (needBoth) {
      if (!isValidNgLocalIdNumber(nin) || !isValidNgLocalIdNumber(bvn)) {
        setError('Enter an 11-digit NIN and BVN')
        return
      }
    } else if (singleType === 'NIN') {
      if (!isValidNgLocalIdNumber(nin)) {
        setError('Enter an 11-digit NIN')
        return
      }
    } else if (singleType === 'BVN') {
      if (!isValidNgLocalIdNumber(bvn)) {
        setError('Enter an 11-digit BVN')
        return
      }
    } else {
      return
    }

    setSaving(true)
    try {
      const body = needBoth
        ? { nin: nin.trim(), bvn: bvn.trim() }
        : singleType === 'NIN'
          ? { ngLocalIdType: 'NIN', ngLocalIdNumber: nin.trim() }
          : { ngLocalIdType: 'BVN', ngLocalIdNumber: bvn.trim() }

      const res = await apiPatch('/api/compliance/ng-local-verification', body)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data.error === 'string' ? data.error : 'Save failed')
        return
      }
      haptics.success()
      setOpen(false)
      setNin('')
      setBvn('')
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (missingTypes.length === 0) return null

  return (
    <>
      <Text style={[styles.inline, style]}>
        {ngSupplementInlinePrompt(missingTypes)}
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
      <WebAwareModal visible={open} onRequestClose={() => setOpen(false)} keyboardAvoiding compact>
        <View style={styles.modalPanel}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.intro}>{intro}</Text>
          {needNin ? (
            <>
              <Text style={styles.label}>{copy.fieldLabelNin}</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                maxLength={11}
                value={nin}
                onChangeText={(t) => setNin(digitsOnly(t))}
                placeholder="00000000000"
                placeholderTextColor={colors.text.tertiary}
                autoFocus
                returnKeyType={needBvn ? 'next' : 'done'}
                textContentType="none"
              />
            </>
          ) : null}
          {needBvn ? (
            <>
              <Text style={styles.label}>{copy.fieldLabelBvn}</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                maxLength={11}
                value={bvn}
                onChangeText={(t) => setBvn(digitsOnly(t))}
                placeholder="00000000000"
                placeholderTextColor={colors.text.tertiary}
                autoFocus={!needNin}
                returnKeyType="done"
                textContentType="none"
              />
            </>
          ) : null}
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
