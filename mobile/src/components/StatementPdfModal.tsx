import React, { useMemo, useState } from 'react'
import {
  Modal,
  View,
  Text,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import * as Sharing from 'expo-sharing'
import { X } from 'lucide-react-native'
import { noahService } from '../lib/noahService'
import { colors, spacing, borderRadius, textStyles, fontFamily, compactInputMetrics } from '../theme'
import { ripple } from '../lib/androidRipple'
import { useToast } from './ToastProvider'
import { useWebCenteredModal } from '../lib/webCenteredModal'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

type AccountCurrency = 'USD' | 'EUR'
type Preset = '30d' | '3m' | '6m' | 'custom'

type Props = {
  visible: boolean
  onClose: () => void
  accountCurrency: AccountCurrency
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return toIso(new Date())
}

function fromPreset(preset: Exclude<Preset, 'custom'>): string {
  const d = new Date()
  if (preset === '30d') d.setDate(d.getDate() - 30)
  if (preset === '3m') d.setMonth(d.getMonth() - 3)
  if (preset === '6m') d.setMonth(d.getMonth() - 6)
  return toIso(d)
}

export function StatementPdfModal({ visible, onClose, accountCurrency }: Props) {
  const useCenteredModal = useWebCenteredModal()
  const [preset, setPreset] = useState<Preset>('30d')
  const [fromStr, setFromStr] = useState(() => fromPreset('30d'))
  const [toStr, setToStr] = useState(() => todayIso())
  const [loading, setLoading] = useState(false)
  const { showError, showWarning, showSuccess } = useToast()
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  )

  const applyPreset = (next: Preset) => {
    setPreset(next)
    if (next === 'custom') return
    setFromStr(fromPreset(next))
    setToStr(todayIso())
  }

  const download = async () => {
    if (!ISO_RE.test(fromStr) || !ISO_RE.test(toStr)) {
      showWarning('Use YYYY-MM-DD format for both dates.')
      return
    }
    if (fromStr > toStr) {
      showWarning('From date must be before to date.')
      return
    }
    setLoading(true)
    try {
      const { uri } = await noahService.downloadStatementPdf({
        from: fromStr,
        to: toStr,
        currency: accountCurrency,
        timeZone,
      })
      const can = await Sharing.isAvailableAsync()
      if (can) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Statement',
          UTI: 'com.adobe.pdf',
        })
      } else {
        showSuccess(`Statement saved to:\n${uri}`)
      }
      onClose()
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Could not generate statement')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType={useCenteredModal ? 'fade' : 'slide'}
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.backdrop, useCenteredModal && styles.backdropWeb]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.sheet, useCenteredModal && styles.sheetWeb]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Download statement</Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              android_ripple={ripple.neutral}
              style={({ pressed }) => pressed && Platform.OS === 'ios' && styles.iconHitPressedIOS}
            >
              <X size={22} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Export a PDF of your account statement. We also email a copy to your signed-in address.
          </Text>
          <Text style={styles.accountLine}>
            Account: <Text style={styles.accountStrong}>{accountCurrency}</Text>
          </Text>

          <View style={styles.presetRow}>
            {([
              ['30d', '30 days'],
              ['3m', '3 months'],
              ['6m', '6 months'],
              ['custom', 'Custom'],
            ] as const).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => applyPreset(key)}
                style={[styles.preset, preset === key && styles.presetActive]}
              >
                <Text style={[styles.presetText, preset === key && styles.presetTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {preset === 'custom' ? (
            <>
              <Text style={styles.label}>From (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={fromStr}
                onChangeText={setFromStr}
                placeholder="2026-01-01"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.label}>To (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={toStr}
                onChangeText={setToStr}
                placeholder="2026-03-30"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.primary,
              loading && styles.primaryDisabled,
              Platform.OS === 'android' && styles.primaryClip,
              pressed && Platform.OS === 'ios' && !loading && styles.primaryPressedIOS,
            ]}
            disabled={loading}
            onPress={() => void download()}
            android_ripple={ripple.primaryTint}
          >
            {loading ? (
              <ActivityIndicator color={colors.neutral.white} />
            ) : (
              <Text style={styles.primaryText}>Download PDF</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  backdropWeb: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
  },
  sheet: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing[6],
    paddingBottom: spacing[10],
  },
  sheetWeb: {
    width: '100%',
    maxWidth: 480,
    borderRadius: borderRadius['2xl'],
    paddingBottom: spacing[6],
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  sheetTitle: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
  },
  iconHitPressedIOS: {
    opacity: 0.7,
  },
  hint: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginBottom: spacing[2],
  },
  accountLine: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginBottom: spacing[4],
  },
  accountStrong: {
    fontFamily: fontFamily.semibold,
    color: colors.text.primary,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing[2],
  },
  preset: {
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetActive: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  presetText: {
    ...textStyles.labelMedium,
    color: colors.text.secondary,
  },
  presetTextActive: {
    color: colors.neutral.white,
  },
  label: {
    ...textStyles.labelMedium,
    color: colors.text.secondary,
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: borderRadius.full,
    padding: spacing[3],
    ...textStyles.titleMedium,
    color: colors.text.primary,
    minHeight: 48,
    ...compactInputMetrics,
  },
  primary: {
    marginTop: spacing[6],
    backgroundColor: colors.primary.main,
    paddingVertical: spacing[4],
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.6 },
  primaryClip: {
    overflow: 'hidden',
  },
  primaryPressedIOS: {
    opacity: 0.92,
  },
  primaryText: {
    color: colors.neutral.white,
    fontSize: 16,
    fontWeight: '600',
  },
})
