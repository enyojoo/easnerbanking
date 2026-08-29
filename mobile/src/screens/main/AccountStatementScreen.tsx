import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import * as Sharing from 'expo-sharing'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ScreenWrapper from '../../components/ScreenWrapper'
import KeyboardSafeContainer from '../../components/KeyboardSafeContainer'
import { NavigationProps } from '../../types'
import {
  colors,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  textStyles,
  borderRadius,
  spacing,
  motion,
  fontFamily,
  compactInputMetrics,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { useToast } from '../../components/ToastProvider'
import { haptics } from '../../lib/haptics'
import { useAuth } from '../../contexts/AuthContext'
import { noahService } from '../../lib/noahService'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

type AccountCurrency = 'USD' | 'EUR'
type Preset = '30d' | '3m' | '6m' | 'custom'

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

export default function AccountStatementScreen({ navigation }: NavigationProps) {
  const { user, userProfile } = useAuth()
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const { showError, showWarning, showSuccess } = useToast()
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current
  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  const [accountCurrency, setAccountCurrency] = useState<AccountCurrency>('USD')
  const [preset, setPreset] = useState<Preset>('30d')
  const [fromStr, setFromStr] = useState(() => fromPreset('30d'))
  const [toStr, setToStr] = useState(() => todayIso())
  const [loading, setLoading] = useState(false)
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  )

  useEffect(() => {
    const uid = userProfile?.id || user?.id
    if (!uid) return
    void AsyncStorage.getItem(`easner_dashboard_selected_currency_${uid}`).then((stored) => {
      if (stored === 'USD' || stored === 'EUR') setAccountCurrency(stored)
    })
  }, [userProfile?.id, user?.id])

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
      const { uri, sharedByDownload } = await noahService.downloadStatementPdf({
        from: fromStr,
        to: toStr,
        currency: accountCurrency,
        timeZone,
      })
      if (sharedByDownload) {
        showSuccess('Statement downloaded')
        return
      }
      const can = await Sharing.isAvailableAsync()
      if (can) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Statement',
          UTI: 'com.adobe.pdf',
        })
      } else {
        showSuccess('Statement saved')
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Could not generate statement')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenWrapper>
      <KeyboardSafeContainer style={styles.container}>
        <Animated.View
          style={[
            styles.header,
            {
              opacity: headerAnim,
              transform: [{
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [motion.screenEnterTranslateY, 0],
                }),
              }],
            },
          ]}
        >
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.backButton}
            onPress={async () => {
              haptics.tap()
              navigation.goBack()
            }}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Account statement</Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.content,
            {
              opacity: contentAnim,
              transform: [{
                translateY: contentAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [motion.screenEnterTranslateY, 0],
                }),
              }],
            },
          ]}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sectionCard}>
              <Text style={styles.hint}>
                Export a PDF of your account statement. We also email a copy to your account address.
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
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.label}>To (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={toStr}
                    onChangeText={setToStr}
                    placeholder="2026-03-30"
                    placeholderTextColor={colors.text.tertiary}
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
                onPress={() => {
                  haptics.tap()
                  void download()
                }}
                android_ripple={ripple.primaryTint}
              >
                {loading ? (
                  <ActivityIndicator color={colors.neutral.white} />
                ) : (
                  <Text style={styles.primaryText}>Download PDF</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardSafeContainer>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[5],
  },
  sectionCard: {
    ...surfaceFrameStyle(colors),
    padding: spacing[5],
  },
  hint: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginBottom: spacing[3],
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
