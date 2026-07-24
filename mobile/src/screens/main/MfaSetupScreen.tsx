import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Image,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { SvgXml } from 'react-native-svg'
import { useFocusEffect, useRoute } from '@react-navigation/native'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, CircleCheck, Copy } from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import SkeletonLoader from '../../components/SkeletonLoader'
import { Button, OtpCodeInput } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import {
  beginTotpEnrollment,
  getVerifiedTotpFactorId,
  listFactorsForMfaStatus,
  totpFactorsFromListResponse,
  totpKeyUriForEnroll,
  unenrollUnverifiedTotpFactors,
  type TotpFactorLike,
} from '../../lib/auth-mfa'
import { saveMfaVerified } from '../../lib/mfaStatusCache'
import { notifySecurityAlert } from '../../lib/securityAlertNotify'
import {
  colors,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  textStyles,
  borderRadius,
  spacing,
  motion,
  shadows,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { ripple } from '../../lib/androidRipple'
import { NavigationProps } from '../../types'
import { useAuth } from '../../contexts/AuthContext'
import { EasnerAlertSheet } from '../../components/premium'
import { haptics } from '../../lib/haptics'

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

/** MFA enroll copy (kept in sync with `business/components/settings/mfa-settings-dialog.tsx`). */
const MFA_COPY = {
  title: 'Two-factor Auth',
  enrollDescription:
    'Scan this QR code to set up your account using your preferred authenticator app.',
  alreadyEnabled: 'Two-factor authentication is already enabled for this account.',
  /** List-only edge case: no manual Set up — enrollment starts from Security when MFA is off. */
  listNotEnabledHint:
    'Two-factor authentication is not enabled. Open Security and tap MFA when your status shows Off to continue.',
  digitCodeLabel: 'Enter 6-digit code shown to you',
  digitCodeError: 'Enter the 6-digit code from your authenticator app.',
  invalidCodeError: 'You entered an invalid code, try again',
  continueSetup: 'Continue Setup',
  enable: 'Enable',
  enabling: 'Enabling…',
} as const

/**
 * Match `ReceiveMoneyScreen` stablecoin QR: 240×240 frame, `spacing[3]` inset, 200×200 code.
 * Keeps modules centered and clear of the rounded frame.
 */
const MFA_QR_CONTAINER = 240
const MFA_QR_SIZE = 200
const MFA_QR_PADDING = spacing[3]
/** Single-line secret row + compact vertical padding (copy icon aligns with text). */
const MFA_SECRET_BOX_HEIGHT = 40
const MFA_SECRET_SKELETON_HEIGHT =
  MFA_SECRET_BOX_HEIGHT - spacing[1] * 2

type MfaRouteParams = { autoStartEnroll?: boolean; mfaVerifiedOnCard?: boolean }

/** Single snapshot so `loaded` is never true while `factors` still reflect a stale empty list (fixes Set up → Disable flash). */
type MfaListSnapshot = { factors: TotpFactorLike[]; loaded: boolean }

export default function MfaSetupScreen({ navigation, route }: NavigationProps) {
  const { user } = useAuth()
  const insets = useSafeAreaInsets()
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
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
  const scrollRef = useRef<ScrollView>(null)
  const secretCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [mfaList, setMfaList] = useState<MfaListSnapshot>({ factors: [], loaded: false })
  const factors = mfaList.factors
  const listFactorsLoaded = mfaList.loaded
  const [error, setError] = useState<string | null>(null)
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [enrollKeyUri, setEnrollKeyUri] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [showVerifyInput, setShowVerifyInput] = useState(false)
  const [enrollFetching, setEnrollFetching] = useState(false)
  const [verifySubmitting, setVerifySubmitting] = useState(false)
  const [turnOffSubmitting, setTurnOffSubmitting] = useState(false)
  /** When session is AAL1, Supabase requires a TOTP challenge before `unenroll` (AAL2). */
  const [showDisableOtp, setShowDisableOtp] = useState(false)
  const [disableOtpCode, setDisableOtpCode] = useState('')
  const [secretJustCopied, setSecretJustCopied] = useState(false)
  const [disableMfaSheetVisible, setDisableMfaSheetVisible] = useState(false)

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
    setEnrollKeyUri(null)
    setSecret(null)
    setVerifyCode('')
    setShowVerifyInput(false)
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
      setEnrollKeyUri(setup.keyUri)
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
    setEnrollKeyUri(null)
    setSecret(null)
    setVerifyCode('')
    setShowVerifyInput(false)
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
        const raw = String(vErr.message || '').toLowerCase()
        if (raw.includes('invalid') || raw.includes('code')) {
          setError(MFA_COPY.invalidCodeError)
        } else {
          setError(vErr.message || MFA_COPY.invalidCodeError)
        }
        return
      }
      void notifySecurityAlert('mfa_enabled')
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

  const backFromEnroll = useCallback(() => {
    /** Enrollment only runs with `autoStartEnroll`; pop — `useFocusEffect` cleanup drops unverified factors. */
    allowRemoveRef.current = true
    navigation.goBack()
  }, [navigation])

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e: { preventDefault: () => void }) => {
      if (allowRemoveRef.current) return
      if (!autoStartEnroll) return
      e.preventDefault()
      void backFromEnroll()
    })
    return sub
  }, [navigation, backFromEnroll, autoStartEnroll])

  const handleHeaderBack = () => {
    haptics.tap()
    if (autoStartEnroll) {
      backFromEnroll()
      return
    }
    navigation.goBack()
  }

  const confirmTurnOff = () => {
    setShowDisableOtp(false)
    setDisableOtpCode('')
    setDisableMfaSheetVisible(true)
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
      void notifySecurityAlert('mfa_disabled')
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
        const raw = String(vErr.message || '').toLowerCase()
        if (raw.includes('invalid') || raw.includes('code')) {
          setError(MFA_COPY.invalidCodeError)
        } else {
          setError(vErr.message || MFA_COPY.invalidCodeError)
        }
        return
      }
      const { error: uErr } = await supabase.auth.mfa.unenroll({ factorId: id })
      if (uErr) {
        setError(uErr.message || 'Could not disable two-factor authentication.')
        return
      }
      void notifySecurityAlert('mfa_disabled')
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
    await Clipboard.setStringAsync(secret)
    haptics.success()
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
  const verifyCodeDigits = verifyCode.replace(/\D/g, '')
  const canSubmitVerifyCode = verifyCodeDigits.length === 6
  const totpQrValue = useMemo(
    () =>
      enrollKeyUri ||
      (secret ? totpKeyUriForEnroll(secret, user?.email ?? undefined) : null),
    [enrollKeyUri, secret, user?.email],
  )

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          // Keep layout stable: don't resize/squash when keyboard opens.
          // iOS gets gentle padding; Android relies on the screen layout already being above keyboard.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.scrollContainer}
            contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            // Avoid shifting the whole layout when the keyboard opens; the OTP row is already placed safely.
            automaticallyAdjustKeyboardInsets={false}
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
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
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
                          onFocus={() => {
                            requestAnimationFrame(() => {
                              scrollRef.current?.scrollToEnd({ animated: true })
                            })
                          }}
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
                          style={styles.stackedOutlineButton}
                          onPress={() => {
                            setShowDisableOtp(false)
                            setDisableOtpCode('')
                            setError(null)
                          }}
                          disabled={turnOffSubmitting}
                        />
                        {error ? <Text style={styles.inlineErrorText}>{error}</Text> : null}
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
                    {!showDisableOtp && error ? <Text style={styles.inlineErrorText}>{error}</Text> : null}
                  </>
                ) : (
                  <Text style={[styles.body, styles.mt]}>{MFA_COPY.listNotEnabledHint}</Text>
                )}
              </View>
            )}

            {showEnrollUi && (
              <View style={styles.sectionCard}>
                {!showVerifyInput ? (
                  <>
                    <Text style={styles.enrollIntro}>{MFA_COPY.enrollDescription}</Text>
                    <View style={styles.qrSection}>
                      <View style={styles.qrContainer}>
                        {totpQrValue ? (
                          <QRCode
                            value={totpQrValue}
                            size={MFA_QR_SIZE}
                            color={colors.text.primary}
                            backgroundColor={colors.semantic.card}
                          />
                        ) : enrollQrSvg ? (
                          <View style={styles.qrCanvas}>
                            <SvgXml
                              xml={enrollQrSvg}
                              width={MFA_QR_SIZE}
                              height={MFA_QR_SIZE}
                              preserveAspectRatio="xMidYMid slice"
                            />
                          </View>
                        ) : qrDataUrl ? (
                          <View style={styles.qrCanvas}>
                            <Image
                              source={{ uri: qrDataUrl }}
                              style={styles.qrImageFill}
                              resizeMode="cover"
                            />
                          </View>
                        ) : (
                          <SkeletonLoader width={MFA_QR_SIZE} height={MFA_QR_SIZE} borderRadius={borderRadius.lg} />
                        )}
                      </View>
                    </View>
                    <View style={styles.secretBox} accessibilityState={{ busy: !secret }}>
                      {secret ? (
                        <View style={styles.secretRowInner}>
                          <Text
                            style={styles.secretText}
                            selectable
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            {...Platform.select({
                              android: { includeFontPadding: false },
                            })}
                          >
                            {secret}
                          </Text>
                          <Pressable
                            android_ripple={ripple.neutral}
                            style={[styles.copySecretButton, { marginLeft: spacing[2] }]}
                            onPress={() => void copySecret()}
                            accessibilityRole="button"
                            accessibilityLabel={secretJustCopied ? 'Copied' : 'Copy secret key'}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            {secretJustCopied ? (
                              <CircleCheck size={18} color={colors.success.main} strokeWidth={2} />
                            ) : (
                              <Copy size={18} color={colors.primary.main} strokeWidth={2} />
                            )}
                          </Pressable>
                        </View>
                      ) : (
                        <SkeletonLoader
                          width="100%"
                          height={MFA_SECRET_SKELETON_HEIGHT}
                          borderRadius={borderRadius.md}
                        />
                      )}
                    </View>
                  </>
                ) : null}
                {showVerifyInput ? (
                  <View
                    style={[
                      styles.otpAfterSecret,
                      verifySubmitting ? styles.otpVerifyLock : undefined,
                    ]}
                    pointerEvents={verifySubmitting ? 'none' : 'auto'}
                  >
                    <OtpCodeInput
                      id="mfa-verify-code"
                      label={MFA_COPY.digitCodeLabel}
                      centerLabel
                      labelStyle={styles.verifyCodeLabel}
                      value={verifyCode}
                      onChange={setVerifyCode}
                      autoFocus={!!enrollFactorId && !enrollFetching}
                      onFocus={() => {
                        requestAnimationFrame(() => {
                          scrollRef.current?.scrollToEnd({ animated: true })
                        })
                      }}
                      disabled={verifySubmitting || enrollFetching || !enrollFactorId}
                    />
                  </View>
                ) : null}
                <View style={[styles.enrollCtaWrap, showVerifyInput ? styles.enrollCtaWrapAfterOtp : undefined]}>
                  <Button
                    title={
                      showVerifyInput
                        ? verifySubmitting
                          ? MFA_COPY.enabling
                          : MFA_COPY.enable
                        : MFA_COPY.continueSetup
                    }
                    fullWidth
                    onPress={() => {
                      if (!showVerifyInput) {
                        setError(null)
                        setShowVerifyInput(true)
                        requestAnimationFrame(() => {
                          scrollRef.current?.scrollToEnd({ animated: true })
                        })
                        return
                      }
                      void completeEnroll()
                    }}
                    disabled={
                      verifySubmitting ||
                      enrollFetching ||
                      !enrollFactorId ||
                      (showVerifyInput && !canSubmitVerifyCode)
                    }
                    loading={showVerifyInput && verifySubmitting}
                  />
                </View>
                {error ? (
                  <Text style={[styles.inlineErrorText, styles.inlineErrorTextCentered]}>{error}</Text>
                ) : null}
              </View>
            )}
          </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <EasnerAlertSheet
        visible={disableMfaSheetVisible}
        onDismiss={() => setDisableMfaSheetVisible(false)}
        title="Disable two-factor authentication?"
        message="You will only need your password to sign in. You can turn 2FA back on anytime."
        primaryLabel="Yes, disable"
        onPrimary={() => {
          setDisableMfaSheetVisible(false)
          void turnOffMfa()
        }}
        secondaryLabel="Cancel"
        onSecondary={() => setDisableMfaSheetVisible(false)}
        primaryLoading={turnOffSubmitting}
      />
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.semantic.background,
  },
  scrollContainer: {
    flex: 1,
  },
  keyboard: {
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
  enrollIntro: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginBottom: spacing[4],
  },
  content: {
    padding: spacing[5],
    gap: spacing[4],
  },
  sectionCard: {
    ...surfaceFrameStyle(colors),
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
  inlineErrorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    marginTop: spacing[3],
  },
  inlineErrorTextCentered: {
    textAlign: 'center',
  },
  /** Parity with `ReceiveMoneyScreen` `qrSection` / `qrContainer` / `qrImage`. */
  qrSection: {
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  qrContainer: {
    width: MFA_QR_CONTAINER,
    height: MFA_QR_CONTAINER,
    borderRadius: borderRadius['2xl'],
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.semantic.card,
    padding: MFA_QR_PADDING,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.frame.border,
    ...shadows.sm,
  },
  /** Clip SVG/PNG fallovers so the code fills the 200×200 slot (Receive parity for raster). */
  qrCanvas: {
    width: MFA_QR_SIZE,
    height: MFA_QR_SIZE,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  qrImageFill: {
    width: MFA_QR_SIZE,
    height: MFA_QR_SIZE,
  },
  secretBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.semantic.card,
    paddingLeft: spacing[3],
    paddingRight: spacing[2],
    paddingVertical: spacing[1],
    marginBottom: 0,
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  stackedOutlineButton: {
    marginTop: spacing[2],
  },
  otpAfterSecret: {
    marginTop: spacing[10],
  },
  otpVerifyLock: {
    opacity: 0.8,
  },
  enrollCtaWrap: {
    marginTop: spacing[4],
  },
  enrollCtaWrapAfterOtp: {
    marginTop: spacing[3],
  },
  verifyCodeLabel: {
    marginBottom: spacing[4],
  },
})
