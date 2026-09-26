import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import {
  NG_LOCAL_VERIFICATION_COPY,
  isValidNgLocalIdNumber,
  type NgLocalIdType,
} from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import {
  colors,
  spacing,
  textStyles,
  borderRadius,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  fontSize,
  lineHeight as lineHeightScale,
} from '../../theme'
import { haptics } from '../../lib/haptics'
import { useStackHardwareBack } from '../../hooks/useStackHardwareBack'
import { navigateStackBack } from '../../navigation/stackBackNavigation'
import { apiPatch } from '../../lib/apiClient'
import { useToast } from '../../components/ToastProvider'
import { useAuth } from '../../contexts/AuthContext'
import { residenceCountryFromProfile } from '../../lib/residenceCountryPersist'
import {
  clearNgLocalVerificationCache,
  prefetchNgLocalVerificationState,
  writeNgLocalVerificationCache,
} from '../../lib/warmYcLocalDepositCaches'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'
import { WEB_FLOW_MAX_WIDTH } from '../../components/layout/CenteredWebFlowPage'

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11)
}

export default function NgLocalVerificationSetupScreen({ navigation }: NavigationProps) {
  const { userProfile, refreshUserProfile } = useAuth()
  const { showSuccess, showError } = useToast()
  const residence =
    residenceCountryFromProfile(userProfile)?.trim().toUpperCase() || 'NG'

  const [missingTypes, setMissingTypes] = useState<NgLocalIdType[]>(['NIN', 'BVN'])
  const [loading, setLoading] = useState(true)
  const [nin, setNin] = useState('')
  const [bvn, setBvn] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needNin = missingTypes.includes('NIN')
  const needBvn = missingTypes.includes('BVN')
  const needBoth = needNin && needBvn
  const intro = useMemo(
    () => (needBoth ? NG_LOCAL_VERIFICATION_COPY.introBoth : NG_LOCAL_VERIFICATION_COPY.introOne),
    [needBoth],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const state = await prefetchNgLocalVerificationState(residence)
      if (cancelled) return
      if (state?.complete) {
        navigateStackBack(navigation)
        return
      }
      if (state?.missingTypes?.length) setMissingTypes(state.missingTypes)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [navigation, residence])

  const handleBack = useCallback(() => {
    navigateStackBack(navigation)
  }, [navigation])
  useStackHardwareBack(handleBack)

  const save = useCallback(async () => {
    setError(null)
    if (needBoth) {
      if (!isValidNgLocalIdNumber(nin) || !isValidNgLocalIdNumber(bvn)) {
        setError('Enter an 11-digit NIN and BVN')
        return
      }
    } else if (needNin && !isValidNgLocalIdNumber(nin)) {
      setError('Enter an 11-digit NIN')
      return
    } else if (needBvn && !isValidNgLocalIdNumber(bvn)) {
      setError('Enter an 11-digit BVN')
      return
    }

    setSaving(true)
    try {
      const body = needBoth
        ? { nin: nin.trim(), bvn: bvn.trim() }
        : needNin
          ? { ngLocalIdType: 'NIN', ngLocalIdNumber: nin.trim() }
          : { ngLocalIdType: 'BVN', ngLocalIdNumber: bvn.trim() }

      const res = await apiPatch('/api/compliance/ng-local-verification', body)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Save failed')
        return
      }

      clearNgLocalVerificationCache(residence)
      writeNgLocalVerificationCache(residence, {
        missingType: null,
        missingTypes: [],
        complete: true,
      })
      void refreshUserProfile?.()
      haptics.success()
      showSuccess(NG_LOCAL_VERIFICATION_COPY.verified)
      navigateStackBack(navigation)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      showError('Could not save verification')
    } finally {
      setSaving(false)
    }
  }, [
    bvn,
    navigation,
    needBoth,
    needBvn,
    needNin,
    nin,
    refreshUserProfile,
    residence,
    showError,
    showSuccess,
  ])

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              haptics.tap()
              handleBack()
            }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>{NG_LOCAL_VERIFICATION_COPY.title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary.main} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.panel}>
              <Text style={styles.intro}>{intro}</Text>

              {needNin ? (
                <View style={styles.field}>
                  <Text style={styles.label}>{NG_LOCAL_VERIFICATION_COPY.fieldLabelNin}</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={11}
                    value={nin}
                    onChangeText={(t) => setNin(digitsOnly(t))}
                    placeholder="00000000000"
                    placeholderTextColor={colors.text.tertiary}
                    textContentType="none"
                    autoFocus={needNin}
                  />
                </View>
              ) : null}

              {needBvn ? (
                <View style={styles.field}>
                  <Text style={styles.label}>{NG_LOCAL_VERIFICATION_COPY.fieldLabelBvn}</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={11}
                    value={bvn}
                    onChangeText={(t) => setBvn(digitsOnly(t))}
                    placeholder="00000000000"
                    placeholderTextColor={colors.text.tertiary}
                    textContentType="none"
                    autoFocus={!needNin && needBvn}
                  />
                </View>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <GlossyPrimaryButton
                title={saving ? 'Saving…' : NG_LOCAL_VERIFICATION_COPY.save}
                onPress={() => {
                  void save()
                }}
                disabled={saving}
              />
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  backButton: {
    ...surfaceChromeCircleStyle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...textStyles.headlineSmall,
    flex: 1,
    textAlign: 'center',
    color: colors.text.primary,
  },
  headerSpacer: { width: 40 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
    maxWidth: WEB_FLOW_MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  panel: {
    ...surfaceFrameStyle,
    padding: spacing[5],
    gap: spacing[4],
  },
  intro: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    lineHeight: Math.round(fontSize.sm * lineHeightScale.relaxed),
  },
  field: { gap: spacing[2] },
  label: {
    ...textStyles.bodyMedium,
    fontWeight: '600',
    color: colors.text.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    color: colors.text.primary,
    fontSize: fontSize.md,
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.status.error,
  },
})
