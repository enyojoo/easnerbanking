import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Clipboard,
  Animated,
  Platform,
} from 'react-native'
import { SvgXml } from 'react-native-svg'
import { useFocusEffect, useRoute } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import ScreenWrapper from '../../components/ScreenWrapper'
import SkeletonLoader from '../../components/SkeletonLoader'
import { Button, OtpCodeInput } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import {
  beginTotpEnrollment,
  getVerifiedTotpFactorId,
  listFactorsForMfaStatus,
  totpFactorsFromListResponse,
  unenrollUnverifiedTotpFactors,
  type TotpFactorLike,
} from '../../lib/auth-mfa'
import { saveMfaVerified } from '../../lib/mfaStatusCache'
import { colors, textStyles, borderRadius, spacing, motion } from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { NavigationProps } from '../../types'

function svgXmlFromQrDataUrl(qrDataUrl: string | null): string | null {
  if (!qrDataUrl || !qrDataUrl.startsWith('data:image/svg')) return null
  const i = qrDataUrl.indexOf(',')
  if (i === -1) return null
  try {
    return decodeURIComponent(qrDataUrl.slice(i + 1))
  } catch {
    return null
  }
}

/** Same strings as `business/components/settings/mfa-settings-dialog.tsx` */
const MFA_COPY = {
  title: 'Two-factor authentication',
  enrollDescription:
    'Scan this QR code to set up your account using your preferred authenticator app. Popular choices include Google Authenticator, Microsoft Authenticator, and Authy.',
  alreadyEnabled: 'Two-factor authentication is already enabled for this account.',
  /** List-only edge case: no manual Set up — enrollment starts from Security when MFA is off. */
  listNotEnabledHint:
    'Two-factor authentication is not enabled. Open Security and tap MFA when your status shows Off to continue.',
  secretLabel: 'Secret key',
  digitCodeLabel: '6-digit code',
  digitCodeError: 'Enter the 6-digit code from your authenticator app.',
  enable: 'Enable',
  enabling: 'Enabling…',
} as const

/** Outer square (border included in layout). */
const MFA_QR_FRAME = 192
/** Padding so the QR module grid clears the border and rounded corners (avoids “cut” edges). */
const MFA_QR_INSET = spacing[2]
const MFA_QR_DRAW_SIZE = MFA_QR_FRAME - MFA_QR_INSET * 2
const MFA_SECRET_BOX_HEIGHT = 56

type MfaRouteParams = { autoStartEnroll?: boolean; mfaVerifiedOnCard?: boolean }

/** Single snapshot so `loaded` is never true while `factors` still reflect a stale empty list (fixes Set up → Disable flash). */
type MfaListSnapshot = { factors: TotpFactorLike[]; loaded: boolean }

export default function MfaSetupScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const navRoute = useRoute()
  const params = ((navRoute.params ?? route?.params) ?? {}) as MfaRouteParams
  const autoStartEnroll = params.autoStartEnroll === true
  /** From Security row when status is On — show Disable UI immediately (no spinner). */
  const mfaVerifiedOnCard = params.mfaVerifiedOnCard === true

  const enrollGenRef = useRef(0)
  /** Avoid edge-case `goBack` when we already pop after successful verify. */
  const suppressVerifiedApiPopRef = useRef(false)
  /** `beforeRemove` blocks pops while on enroll; set true right before intentional `goBack`. */
  const allowRemoveRef = useRef(false)
  const secretCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [mfaList, setMfaList] = useState<MfaListSnapshot>({ factors: [], loaded: false })
  const factors = mfaList.factors
  const listFactorsLoaded = mfaList.loaded
  const [error, setError] = useState<string | null>(null)
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [enrollFetching, setEnrollFetching] = useState(false)
  const [verifySubmitting, setVerifySubmitting] = useState(false)
  const [turnOffSubmitting, setTurnOffSubmitting] = useState(false)
  /** When session is AAL1, Supabase requires a TOTP challenge before `unenroll` (AAL2). */
  const [showDisableOtp, setShowDisableOtp] = useState(false)
  const [disableOtpCode, setDisableOtpCode] = useState('')
  const [secretJustCopied, setSecretJustCopied] = useState(false)

  /** Skip fade-in when jumping straight to QR — avoids hiding content for `motion.screenEnterMs` while enroll loads. */
  const headerAnim = useRef(new Animated.Value(autoStartEnroll ? 1 : 0)).current
  const contentAnim = useRef(new Animated.Value(autoStartEnroll ? 1 : 0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  const loadFactors = useCallback(async (): Promise<TotpFactorLike[] | null> => {
    setError(null)
    try {
      const { data, error: listErr } = await listFactorsForMfaStatus(supabase)
      if (listErr) {
        setError(listErr.message || 'Could not load MFA status.')
        setMfaList({ factors: [], loaded: true })
        return null
      }
      const next = totpFactorsFromListResponse(data)
      setMfaList({ factors: next, loaded: true })
      return next
    } catch {
      setError('Could not load MFA status.')
      setMfaList({ factors: [], loaded: true })
      return null
    }
  }, [])

  const resetLocal = useCallback(() => {
    setEnrollFactorId(null)
    setQrDataUrl(null)
    setSecret(null)
    setVerifyCode('')
    setShowDisableOtp(false)
    setDisableOtpCode('')
    setError(null)
  }, [])

  /**
   * Same pattern as `business/components/settings/mfa-settings-dialog.tsx`: when opening from
   * Security with MFA off, go straight to the QR step and start enroll immediately — no list + Set up.
   */
  const startEnroll = useCallback(async (generation: number) => {
    setError(null)
    setEnrollFetching(true)
    try {
      const setup = await beginTotpEnrollment(supabase)
      if (generation !== enrollGenRef.current) return
      setEnrollFactorId(setup.factorId)
      setQrDataUrl(setup.qrDataUrl)
      setSecret(setup.secret)
    } catch (e) {
      if (generation !== enrollGenRef.current) return
      setError(e instanceof Error ? e.message : 'Could not start enrollment.')
    } finally {
      if (generation === enrollGenRef.current) {
        setEnrollFetching(false)
      }
    }
  }, [])

  useLayoutEffect(() => {
    if (!autoStartEnroll) return
    enrollGenRef.current += 1
    const generation = enrollGenRef.current
    setEnrollFactorId(null)
    setQrDataUrl(null)
    setSecret(null)
    setVerifyCode('')
    setError(null)
    // Do not call `loadFactors()` here: `beginTotpEnrollment` already lists factors via
    // `unenrollUnverifiedTotpFactors`. Parallel `listFactorsForMfaStatus` (retries) was doubling
    // latency before the QR/secret appeared.
    void startEnroll(generation)
    const t = setTimeout(() => {
      void loadFactors()
    }, 0)
    return () => clearTimeout(t)
  }, [autoStartEnroll, loadFactors, startEnroll])

  useFocusEffect(
    useCallback(() => {
      allowRemoveRef.current = false
      if (!autoStartEnroll) {
        void loadFactors()
      }
      return () => {
        void unenrollUnverifiedTotpFactors(supabase)
      }
    }, [loadFactors, autoStartEnroll]),
  )

  const verifiedFactorId = getVerifiedTotpFactorId(factors)

  /** Disable-only list when not opening straight into QR from Security (no manual Set up). */
  const showListUi = !autoStartEnroll
  /** Off path only: wait for API. When Security said On, show Disable without waiting for list (no flash). */
  const showListSpinner = showListUi && !listFactorsLoaded && !mfaVerifiedOnCard
  const showListDisable =
    showListUi && !showListSpinner && (Boolean(verifiedFactorId) || mfaVerifiedOnCard)
  const showListFallback = showListUi && !showListSpinner && !showListDisable
  /** QR flow only from Security when MFA is off (`autoStartEnroll`). */
  const showEnrollUi = autoStartEnroll

  /** Security card showed Off but API already has verified TOTP — pop. */
  useEffect(() => {
    if (!autoStartEnroll) return
    if (!verifiedFactorId) return
    if (suppressVerifiedApiPopRef.current) return
    let cancelled = false
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.user?.id) await saveMfaVerified(session.user.id, true)
      if (cancelled) return
      enrollGenRef.current += 1
      await unenrollUnverifiedTotpFactors(supabase)
      if (cancelled) return
      allowRemoveRef.current = true
      navigation.goBack()
    })()
    return () => {
      cancelled = true
    }
  }, [autoStartEnroll, verifiedFactorId, navigation])

  const completeEnroll = async () => {
    if (!enrollFactorId) return
    const code = verifyCode.replace(/\D/g, '')
    if (code.length !== 6) {
      setError(MFA_COPY.digitCodeError)
      return
    }
    setError(null)
    setVerifySubmitting(true)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: enrollFactorId,
      })
      if (chErr || !ch?.id) {
        setError(chErr?.message || 'Could not verify the code.')
        return
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: ch.id,
        code,
      })
      if (vErr) {
        setError(vErr.message || 'Invalid code.')
        return
      }
      suppressVerifiedApiPopRef.current = true
      await loadFactors()
      resetLocal()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.user?.id) await saveMfaVerified(session.user.id, true)
      allowRemoveRef.current = true
      navigation.goBack()
    } finally {
      setVerifySubmitting(false)
    }
  }

  const backFromEnroll = useCallback(async () => {
    /** Enrollment only runs with `autoStartEnroll`; pop and clean up unverified factors. */
    allowRemoveRef.current = true
    navigation.goBack()
    void unenrollUnverifiedTotpFactors(supabase)
  }, [navigation])

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (allowRemoveRef.current) return
      if (!autoStartEnroll) return
      e.preventDefault()
      void backFromEnroll()
    })
    return sub
  }, [navigation, backFromEnroll, autoStartEnroll])

  const handleHeaderBack = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (autoStartEnroll) {
      void backFromEnroll()
      return
    }
    void (async () => {
      await unenrollUnverifiedTotpFactors(supabase)
      navigation.goBack()
    })()
  }

  const confirmTurnOff = () => {
    setShowDisableOtp(false)
    setDisableOtpCode('')
    Alert.alert(
      'Disable two-factor authentication?',
      'You will only need your password to sign in. You can turn 2FA back on anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, disable',
          style: 'destructive',
          onPress: () => void turnOffMfa(),
        },
      ],
    )
  }

  const turnOffMfa = async () => {
    setError(null)
    setTurnOffSubmitting(true)
    try {
      const { data, error: listErr } = await supabase.auth.mfa.listFactors()
      if (listErr) {
        setError(listErr.message || 'Could not load MFA factors.')
        await loadFactors()
        return
      }
      const totp = totpFactorsFromListResponse(data)
      const id = getVerifiedTotpFactorId(totp)
      if (!id) {
        setError('No verified authenticator found. Pull to refresh or try again.')
        await loadFactors()
        return
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      const aal2 = aal?.currentLevel === 'aal2'
      if (!aal2) {
        setShowDisableOtp(true)
        return
      }
      const { error: uErr } = await supabase.auth.mfa.unenroll({ factorId: id })
      if (uErr) {
        const msg = (uErr.message || '').toLowerCase()
        if (
          msg.includes('aal') ||
          msg.includes('assurance') ||
          msg.includes('mfa') ||
          msg.includes('factor')
        ) {
          setShowDisableOtp(true)
          return
        }
        setError(uErr.message || 'Could not disable two-factor authentication.')
        return
      }
      const {
        data: { session: s2 },
      } = await supabase.auth.getSession()
      if (s2?.user?.id) await saveMfaVerified(s2.user.id, false)
      await loadFactors()
    } finally {
      setTurnOffSubmitting(false)
    }
  }

  const confirmDisableWithCode = async () => {
    const code = disableOtpCode.replace(/\D/g, '')
    if (code.length !== 6) {
      setError(MFA_COPY.digitCodeError)
      return
    }
    setError(null)
    setTurnOffSubmitting(true)
    try {
      const { data, error: listErr } = await supabase.auth.mfa.listFactors()
      if (listErr) {
        setError(listErr.message || 'Could not load MFA factors.')
        return
      }
      const totp = totpFactorsFromListResponse(data)
      const id = getVerifiedTotpFactorId(totp)
      if (!id) {
        setError('No verified authenticator found.')
        return
      }
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: id })
      if (chErr || !ch?.id) {
        setError(chErr?.message || 'Could not verify the code.')
        return
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: id,
        challengeId: ch.id,
        code,
      })
      if (vErr) {
        setError(vErr.message || 'Invalid code.')
        return
      }
      const { error: uErr } = await supabase.auth.mfa.unenroll({ factorId: id })
      if (uErr) {
        setError(uErr.message || 'Could not disable two-factor authentication.')
        return
      }
      setShowDisableOtp(false)
      setDisableOtpCode('')
      const {
        data: { session: s2 },
      } = await supabase.auth.getSession()
      if (s2?.user?.id) await saveMfaVerified(s2.user.id, false)
      await loadFactors()
    } finally {
      setTurnOffSubmitting(false)
    }
  }

  const copySecret = async () => {
    if (!secret) return
    await Clipboard.setString(secret)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setSecretJustCopied(true)
    if (secretCopiedTimerRef.current) clearTimeout(secretCopiedTimerRef.current)
    secretCopiedTimerRef.current = setTimeout(() => {
      secretCopiedTimerRef.current = null
      setSecretJustCopied(false)
    }, 2000)
  }

  useEffect(() => {
    if (!secret) setSecretJustCopied(false)
  }, [secret])

  useEffect(() => {
    return () => {
      if (secretCopiedTimerRef.current) {
        clearTimeout(secretCopiedTimerRef.current)
        secretCopiedTimerRef.current = null
      }
    }
  }, [])

  const enrollQrSvg = showEnrollUi ? svgXmlFromQrDataUrl(qrDataUrl) : null

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing[5] }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.header,
              {
                opacity: headerAnim,
                transform: [
                  {
                    translateY: headerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-motion.screenEnterTranslateY, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
             android_ripple={ripple.neutral}
              onPress={() => void handleHeaderBack()}
              style={styles.backButton} >
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </Pressable>
            <View style={styles.headerContent}>
              <Text style={styles.title}>{MFA_COPY.title}</Text>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.content,
              {
                opacity: contentAnim,
                transform: [
                  {
                    translateY: contentAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [motion.screenEnterTranslateY, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {showListUi && (
              <View style={styles.sectionCard}>
                {showListSpinner ? (
                  <View style={styles.listLoadingWrap}>
                    <ActivityIndicator size="small" color={colors.primary.main} />
                  </View>
                ) : showListDisable ? (
                  <>
                    <Text style={[styles.body, styles.mt]}>{MFA_COPY.alreadyEnabled}</Text>
                    {showDisableOtp ? (
                      <>
                        <Text style={[styles.body, styles.mtSm]}>
                          Enter the 6-digit code from your authenticator app to confirm disabling 2FA.
                        </Text>
                        <OtpCodeInput
                          id="mfa-disable-code"
                          label={MFA_COPY.digitCodeLabel}
                          value={disableOtpCode}
                          onChange={setDisableOtpCode}
                          autoFocus
                          disabled={turnOffSubmitting}
                        />
                        <Button
                          title="Confirm disable"
                          variant="destructive"
                          fullWidth
                          onPress={() => void confirmDisableWithCode()}
                          disabled={turnOffSubmitting}
                          loading={turnOffSubmitting}
                        />
                        <Button
                          title="Cancel"
                          variant="outline"
                          fullWidth
                          onPress={() => {
                            setShowDisableOtp(false)
                            setDisableOtpCode('')
                            setError(null)
                          }}
                          disabled={turnOffSubmitting}
                        />
                      </>
                    ) : (
                      <Button
                        title="Disable"
                        variant="destructive"
                        fullWidth
                        onPress={confirmTurnOff}
                        disabled={
                          turnOffSubmitting || (!verifiedFactorId && !mfaVerifiedOnCard)
                        }
                        loading={turnOffSubmitting || (!verifiedFactorId && !mfaVerifiedOnCard)}
                      />
                    )}
                  </>
                ) : (
                  <Text style={[styles.body, styles.mt]}>{MFA_COPY.listNotEnabledHint}</Text>
                )}
              </View>
            )}

            {showEnrollUi && (
              <View style={styles.sectionCard}>
                <Text style={styles.enrollIntro}>{MFA_COPY.enrollDescription}</Text>
                <View style={styles.qrWrap}>
                  {enrollQrSvg ? (
                    <SvgXml xml={enrollQrSvg} width={MFA_QR_DRAW_SIZE} height={MFA_QR_DRAW_SIZE} />
                  ) : qrDataUrl ? (
                    <Image source={{ uri: qrDataUrl }} style={styles.qr} resizeMode="contain" />
                  ) : (
                    <SkeletonLoader width={MFA_QR_DRAW_SIZE} height={MFA_QR_DRAW_SIZE} borderRadius={8} />
                  )}
                </View>
                <Text style={styles.label}>{MFA_COPY.secretLabel}</Text>
                <View style={styles.secretBox} accessibilityState={{ busy: !secret }}>
                  {secret ? (
                    <View style={styles.secretRowInner}>
                      <Text
                        style={styles.secretText}
                        selectable
                        numberOfLines={2}
                        {...Platform.select({
                          android: { includeFontPadding: false },
                        })}
                      >
                        {secret}
                      </Text>
                      <Pressable
                       android_ripple={ripple.neutral}
                        style={styles.copySecretButton}
                        onPress={() => void copySecret()}
                        accessibilityRole="button"
                        accessibilityLabel={secretJustCopied ? 'Copied' : 'Copy secret key'}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={secretJustCopied ? 'checkmark-circle' : 'copy-outline'}
                          size={18}
                          color={secretJustCopied ? colors.success.main : colors.primary.main}
                        />
                      </Pressable>
                    </View>
                  ) : (
                    <SkeletonLoader width="100%" height={20} borderRadius={4} />
                  )}
                </View>
                <View
                  style={verifySubmitting ? styles.otpVerifyLock : undefined}
                  pointerEvents={verifySubmitting ? 'none' : 'auto'}
                >
                  <OtpCodeInput
                    id="mfa-verify-code"
                    label={MFA_COPY.digitCodeLabel}
                    value={verifyCode}
                    onChange={setVerifyCode}
                    autoFocus={!!enrollFactorId && !enrollFetching}
                    disabled={verifySubmitting || enrollFetching || !enrollFactorId}
                  />
                </View>
                <Button
                  title={verifySubmitting ? MFA_COPY.enabling : MFA_COPY.enable}
                  fullWidth
                  onPress={() => void completeEnroll()}
                  disabled={verifySubmitting || enrollFetching || !enrollFactorId}
                  loading={verifySubmitting}
                />
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
  },
  enrollIntro: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginBottom: spacing[4],
  },
  content: {
    padding: spacing[5],
  },
  sectionCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
    marginBottom: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: spacing[5],
    paddingHorizontal: spacing[5],
  },
  body: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  mt: {
    marginTop: spacing[4],
    marginBottom: spacing[4],
  },
  mtSm: {
    marginTop: spacing[2],
    marginBottom: spacing[3],
  },
  listLoadingWrap: {
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing[6],
  },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.error.main,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
  },
  qrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing[4],
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.semantic.card,
    width: MFA_QR_FRAME,
    height: MFA_QR_FRAME,
    padding: MFA_QR_INSET,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  qr: {
    width: MFA_QR_DRAW_SIZE,
    height: MFA_QR_DRAW_SIZE,
  },
  label: {
    ...textStyles.labelLarge,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  secretBox: {
    borderWidth: 0.5,
    borderColor: '#E2E2E2',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.semantic.muted,
    paddingLeft: spacing[3],
    paddingRight: spacing[1],
    paddingVertical: spacing[2],
    marginBottom: spacing[4],
    height: MFA_SECRET_BOX_HEIGHT,
    justifyContent: 'center',
  },
  secretRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secretText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: colors.text.primary,
    paddingRight: spacing[1],
  },
  copySecretButton: {
    paddingVertical: 4,
    paddingLeft: 6,
    paddingRight: 2,
    marginLeft: spacing[1],
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpVerifyLock: {
    opacity: 0.8,
  },
})
