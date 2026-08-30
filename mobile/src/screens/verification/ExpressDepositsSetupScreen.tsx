import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Keyboard,
  Platform,
  Pressable,
} from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import {
  EXPRESS_DEPOSITS_COPY,
  buildExpressKycSubmitInfo,
  expressDepositsAdvanceAfter,
  expressDepositsPersistStatus,
  expressIdentityOutcome,
  expressSetupUserMessage,
  isExpressIdentitySuccess,
  isExpressKycAlreadyVerified,
  isExpressIdentitySetupStep,
  isExpressReviewSetupStep,
  isExpressSetupDismissed,
  isUsSsnComplete,
  resolveExpressDepositsSetupStep,
  toExpressLinkE164Phone,
  type ExpressDepositsNextStep,
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
import {
  exitExpressSetupToAddMoney,
  exitToMainTabs,
  navigateStackBack,
} from '../../navigation/stackBackNavigation'
import { apiFetch } from '../../query/api-client'
import { WEB_FLOW_MAX_WIDTH } from '../../components/layout/CenteredWebFlowPage'
import {
  EXPRESS_NATIVE_AUTH_REQUIRED,
  configureExpressOnrampLinkSession,
  loadMobileExpressOnramp,
  prefetchMobileExpressOnramp,
  type ExpressOnrampSdk,
} from '../../lib/express-onramp'
import { isStripeHostElement } from '../../lib/expressStripeElement'
import { ExpressStripeHost } from '../../components/receive/ExpressStripeHost'
import { watchExpressIdentityOverlay } from '../../lib/expressIdentityOverlay'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ToastProvider'
import {
  cacheExpressOnrampStatus,
  fetchExpressOnrampStatus,
  patchExpressOnrampStatus,
  peekExpressOnrampStatus,
  type ExpressOnrampStatus,
} from '../../lib/expressOnrampStatusCache'
import { useExpressOnrampStatus } from '../../hooks/useExpressOnrampStatus'
import {
  applyExpressFormDraft,
  expressFormFromProfile,
  expressFormFromStatusPrefill,
  expressLockedCountry,
  mergeExpressForm,
} from '../../lib/expressSetupForm'
import {
  clearExpressSetupFormDraft,
  hydrateExpressSetupFormDraft,
  persistExpressSetupFormDraft,
  seedExpressSetupForm,
} from '../../lib/expressSetupFormDraft'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'

export default function ExpressDepositsSetupScreen({ navigation }: NavigationProps) {
  const { userProfile } = useAuth()
  const { showInfo } = useToast()
  const express = useExpressOnrampStatus({ refreshOnFocus: true })
  const status = express.status
  const [busy, setBusy] = useState(false)
  const [openingIdentity, setOpeningIdentity] = useState(() => {
    const peeked = peekExpressOnrampStatus()
    return isExpressIdentitySetupStep(resolveExpressDepositsSetupStep(peeked))
  })
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>(() =>
    seedExpressSetupForm(
      mergeExpressForm(
        expressFormFromProfile({
          ...userProfile?.profile,
          email: userProfile?.email ?? userProfile?.profile?.email,
          phone: userProfile?.profile?.phone,
        }),
        expressFormFromStatusPrefill(peekExpressOnrampStatus()?.prefill, peekExpressOnrampStatus()?.payerCountry),
      ),
    ),
  )
  const [stripeEl, setStripeEl] = useState<unknown>(null)
  const l2StartedRef = useRef(false)
  const identitySucceededRef = useRef(false)
  const identityNoticeRef = useRef(false)
  const watchIdentityOverlayRef = useRef(false)
  const dismissL2Ref = useRef<() => void>(() => {})

  const handleBack = useCallback(() => {
    if (resolveExpressDepositsSetupStep(status) === 'ready') {
      exitToMainTabs(navigation, 'Dashboard')
      return
    }
    navigateStackBack(navigation)
  }, [navigation, status])
  useStackHardwareBack(handleBack)

  const applyStatus = useCallback((data: ExpressOnrampStatus) => {
    cacheExpressOnrampStatus(data)
    if (!data.eligible) setMessage(EXPRESS_DEPOSITS_COPY.geoUnavailable)
    setForm((prev) => mergeExpressForm(prev, expressFormFromStatusPrefill(data.prefill, data.payerCountry)))
  }, [])

  const refresh = useCallback(async (force = false) => {
    const data = await fetchExpressOnrampStatus(force)
    applyStatus(data)
    return data
  }, [applyStatus])

  const advanceLocal = useCallback((nextStep: ExpressDepositsNextStep, extra?: Partial<ExpressOnrampStatus>) => {
    patchExpressOnrampStatus({
      ...extra,
      nextStep,
      status: expressDepositsPersistStatus(nextStep),
      ready: nextStep === 'ready',
    })
    if (nextStep === 'ready') clearExpressSetupFormDraft()
  }, [])

  useEffect(() => {
    const peeked = peekExpressOnrampStatus()
    if (peeked?.publishableKey) {
      void loadMobileExpressOnramp(peeked.publishableKey, peeked.cryptoCustomerId).catch(() => undefined)
    } else prefetchMobileExpressOnramp()
    void hydrateExpressSetupFormDraft().then((draft) => {
      if (draft) setForm((prev) => applyExpressFormDraft(prev, draft))
    })
    void refresh(false).catch((e) =>
      setMessage(e instanceof Error ? e.message : EXPRESS_DEPOSITS_COPY.geoUnavailable),
    )
  }, [refresh])

  const lockedCountry = expressLockedCountry(form, status?.payerCountry)
  const step: ExpressDepositsNextStep = resolveExpressDepositsSetupStep(status)

  useEffect(() => {
    if (step === 'ready') {
      clearExpressSetupFormDraft()
      return
    }
    const timer = setTimeout(() => persistExpressSetupFormDraft(form), 250)
    return () => clearTimeout(timer)
  }, [form, step])

  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true)
    setMessage(null)
    try {
      const keepOpen = await fn()
      if (!keepOpen) void refresh(true).catch(() => undefined)
    } catch (e) {
      setOpeningIdentity(false)
      setMessage(expressSetupUserMessage(e instanceof Error ? e.message : null))
    } finally {
      setBusy(false)
    }
  }

  const ensureSdk = async () => {
    const pk = status?.publishableKey || peekExpressOnrampStatus()?.publishableKey
    const data = pk ? (status ?? peekExpressOnrampStatus()) : await refresh(false)
    const key = pk || data?.publishableKey
    if (!key) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
    const customerId = status?.cryptoCustomerId ?? data?.cryptoCustomerId ?? null
    const client = await loadMobileExpressOnramp(key, customerId)
    return client
  }

  const linkAuthBody = () => ({
    email: form.email.trim() || userProfile?.email || userProfile?.profile?.email || undefined,
  })

  const bindLinkSession = async (client: ExpressOnrampSdk, cryptoCustomerId: string) => {
    if (Platform.OS !== 'web') return
    await configureExpressOnrampLinkSession(client, cryptoCustomerId)
  }

  const pollUntilNotReview = async () => {
    let data = await refresh(true)
    for (let i = 0; i < 12 && isExpressReviewSetupStep(data.nextStep); i += 1) {
      await new Promise((r) => setTimeout(r, 2500))
      data = await refresh(true)
    }
    return data
  }

  const field = (
    key: string,
    label: string,
    opts?: { keyboard?: 'email' | 'phone' | 'number'; autoCapitalize?: 'none' | 'words'; secure?: boolean },
  ) => (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.profileFieldBox, styles.profileFieldBoxEditable]}>
        <View style={styles.fieldBoxInner}>
          <TextInput
            style={styles.fieldBoxInput}
            value={form[key] || ''}
            onChangeText={(v) => setForm((p) => ({ ...p, [key]: v }))}
            placeholder={`Enter ${label.toLowerCase()}`}
            placeholderTextColor={colors.text.tertiary}
            autoCapitalize={opts?.autoCapitalize ?? (opts?.keyboard === 'email' ? 'none' : 'words')}
            autoCorrect={opts?.keyboard === 'email' ? false : true}
            keyboardType={
              opts?.keyboard === 'email'
                ? 'email-address'
                : opts?.keyboard === 'phone'
                  ? 'phone-pad'
                  : opts?.keyboard === 'number'
                    ? 'number-pad'
                    : 'default'
            }
            returnKeyType="done"
            secureTextEntry={opts?.secure}
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>
      </View>
    </View>
  )

  const cta =
    step === 'ready' || isExpressReviewSetupStep(step)
      ? null
      : step === 'wallet'
        ? EXPRESS_DEPOSITS_COPY.finishSetupCta
        : step === 'us_l2' || step === 'eu_l2'
          ? EXPRESS_DEPOSITS_COPY.verifyCta
          : step === 'link'
            ? EXPRESS_DEPOSITS_COPY.setupCta
            : EXPRESS_DEPOSITS_COPY.continueCta

  const onCta = () => {
    void run(async () => {
      const client = await ensureSdk()
      if (step === 'link') {
        const auth = await apiFetch<{ authIntentId?: string | null; needsRegister?: boolean }>(
          '/api/stripe/onramp/link-auth',
          { method: 'POST', body: linkAuthBody() },
        )
        if (auth.needsRegister) {
          await client.registerLinkUser?.(
            form.email.trim(),
            toExpressLinkE164Phone(form.phone, lockedCountry),
            lockedCountry,
            `${form.given_name} ${form.surname}`.trim(),
          )
        }
        let intentId = auth.authIntentId
        if (!intentId) {
          const again = await apiFetch<{ authIntentId?: string | null }>(
            '/api/stripe/onramp/link-auth',
            { method: 'POST', body: linkAuthBody() },
          )
          intentId = again.authIntentId
        }
        if (intentId && client.authenticate) {
          const el = await client.authenticate(intentId, async (result) => {
            const outcome = String(result.result || '')
            if (outcome === 'success' && result.crypto_customer_id) {
              await bindLinkSession(client, result.crypto_customer_id)
              await apiFetch('/api/stripe/onramp/link-complete', {
                method: 'POST',
                body: {
                  cryptoCustomerId: result.crypto_customer_id,
                  accessToken: result.access_token || result.oauth_token,
                  authIntentId: intentId,
                },
              })
              setStripeEl(null)
              setMessage(null)
              advanceLocal(
                expressDepositsAdvanceAfter({ completed: 'link', payerCountry: lockedCountry }),
                { cryptoCustomerId: String(result.crypto_customer_id) },
              )
              void refresh(true)
            } else if (isExpressSetupDismissed(outcome)) {
              setStripeEl(null)
              setMessage(null)
              showInfo(EXPRESS_DEPOSITS_COPY.setupDismissed, 5000)
            } else if (outcome && outcome !== 'success') {
              setStripeEl(null)
              setMessage(expressSetupUserMessage(outcome))
            }
          })
          if (isStripeHostElement(el)) {
            setStripeEl(el)
            return true
          }
        }
        return
      }
      if (step === 'us_l2' || step === 'eu_l2') {
        setOpeningIdentity(true)
        let settled = false
        identitySucceededRef.current = false
        identityNoticeRef.current = false
        const finish = (raw: unknown) => {
          if (settled) return
          settled = true
          watchIdentityOverlayRef.current = false
          const outcome = expressIdentityOutcome(raw)
          setStripeEl(null)
          setOpeningIdentity(false)
          if (isExpressIdentitySuccess(outcome)) {
            identitySucceededRef.current = true
            setMessage(null)
            advanceLocal(expressDepositsAdvanceAfter({ completed: step }))
            void pollUntilNotReview()
            return
          }
          if (identityNoticeRef.current) return
          identityNoticeRef.current = true
          setMessage(null)
          showInfo(EXPRESS_DEPOSITS_COPY.setupDismissed, 5000)
        }
        dismissL2Ref.current = () => finish({ result: 'submitted' })

        const authorizeLink = async (): Promise<boolean> => {
          if (!client.authenticate) return true
          let auth: { authIntentId?: string | null; needsRegister?: boolean }
          try {
            auth = await apiFetch<{ authIntentId?: string | null; needsRegister?: boolean }>(
              '/api/stripe/onramp/link-auth',
              { method: 'POST', body: linkAuthBody() },
            )
          } catch (e) {
            watchIdentityOverlayRef.current = false
            throw e
          }
          let intentId = auth.authIntentId
          if (!intentId && auth.needsRegister && !status?.cryptoCustomerId) {
            await client.registerLinkUser?.(
              form.email.trim(),
              toExpressLinkE164Phone(form.phone, lockedCountry),
              lockedCountry,
              `${form.given_name} ${form.surname}`.trim(),
            )
            const again = await apiFetch<{ authIntentId?: string | null }>(
              '/api/stripe/onramp/link-auth',
              { method: 'POST', body: linkAuthBody() },
            )
            intentId = again.authIntentId
          }
          if (!intentId) {
            throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
          }

          if (Platform.OS === 'web') {
            return new Promise((resolve, reject) => {
              void client
                .authenticate!(intentId!, async (result) => {
                const outcome = String(result.result || '')
                if (outcome === 'success') {
                  if (result.crypto_customer_id) {
                    await bindLinkSession(client, result.crypto_customer_id)
                    await apiFetch('/api/stripe/onramp/link-complete', {
                      method: 'POST',
                      body: {
                        cryptoCustomerId: result.crypto_customer_id,
                        accessToken: result.access_token || result.oauth_token,
                        authIntentId: intentId,
                      },
                    })
                  }
                  setStripeEl(null)
                  resolve(true)
                  return
                }
                if (isExpressSetupDismissed(outcome)) {
                  setStripeEl(null)
                  finish({ result: 'canceled' })
                  resolve(false)
                  return
                }
                setStripeEl(null)
                resolve(false)
              }).then((el) => {
                if (isStripeHostElement(el)) setStripeEl(el)
              }).catch(reject)
            })
          }

          await client.authenticate(intentId, async (result) => {
            const outcome = String(result.result || '')
            if (outcome === 'success' && result.crypto_customer_id) {
              await bindLinkSession(client, result.crypto_customer_id)
              await apiFetch('/api/stripe/onramp/link-complete', {
                method: 'POST',
                body: {
                  cryptoCustomerId: result.crypto_customer_id,
                  accessToken: result.access_token || result.oauth_token,
                  authIntentId: intentId,
                },
              })
            } else if (isExpressSetupDismissed(outcome)) {
              finish({ result: 'canceled' })
            }
          })
          return !settled
        }

        const authed = await authorizeLink()
        if (!authed || settled) return true

        watchIdentityOverlayRef.current = true
        const verify = client.verifyDocuments || client.verifyIdentity
        if (!verify) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
        try {
          const first = await Promise.resolve(verify(finish))
          if (isStripeHostElement(first)) {
            setStripeEl(first)
            return true
          }
          if (first !== undefined) finish(first)
        } catch (e) {
          if (isExpressKycAlreadyVerified(e instanceof Error ? e.message : String(e))) {
            finish({ result: 'submitted' })
            return true
          }
          if (!(e instanceof Error) || e.message !== EXPRESS_NATIVE_AUTH_REQUIRED) throw e
          const againAuthed = await authorizeLink()
          if (!againAuthed || settled) return true
          const again = await Promise.resolve(verify(finish))
          if (isStripeHostElement(again)) {
            setStripeEl(again)
            return true
          }
          if (again !== undefined) finish(again)
        }
        return true
      }
      if (step === 'us_kyc' || step === 'eu_kyc') {
        if (step === 'us_kyc' && !isUsSsnComplete(form.ssn)) {
          throw new Error(EXPRESS_DEPOSITS_COPY.ssnHint)
        }
        if (client.authenticate) {
          const authed = await (async (): Promise<boolean> => {
            const auth = await apiFetch<{ authIntentId?: string | null; needsRegister?: boolean }>(
              '/api/stripe/onramp/link-auth',
              { method: 'POST', body: linkAuthBody() },
            )
            let intentId = auth.authIntentId
            if (!intentId && auth.needsRegister && !status?.cryptoCustomerId) {
              await client.registerLinkUser?.(
                form.email.trim(),
                toExpressLinkE164Phone(form.phone, lockedCountry),
                lockedCountry,
                `${form.given_name} ${form.surname}`.trim(),
              )
              const again = await apiFetch<{ authIntentId?: string | null }>(
                '/api/stripe/onramp/link-auth',
                { method: 'POST', body: linkAuthBody() },
              )
              intentId = again.authIntentId
            }
            if (!intentId) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
            if (Platform.OS === 'web') {
              return new Promise((resolve, reject) => {
                void client
                  .authenticate!(intentId!, async (result) => {
                    const outcome = String(result.result || '')
                    if (outcome === 'success') {
                      if (result.crypto_customer_id) {
                        await bindLinkSession(client, String(result.crypto_customer_id))
                        await apiFetch('/api/stripe/onramp/link-complete', {
                          method: 'POST',
                          body: {
                            cryptoCustomerId: result.crypto_customer_id,
                            accessToken: result.access_token || result.oauth_token,
                            authIntentId: intentId,
                          },
                        })
                      }
                      setStripeEl(null)
                      resolve(true)
                      return
                    }
                    if (isExpressSetupDismissed(outcome)) {
                      setStripeEl(null)
                      resolve(false)
                      return
                    }
                    setStripeEl(null)
                    resolve(false)
                  })
                  .then((el) => {
                    if (isStripeHostElement(el)) setStripeEl(el)
                  })
                  .catch(reject)
              })
            }
            await client.authenticate(intentId, async (result) => {
              const outcome = String(result.result || '')
              if (outcome === 'success' && result.crypto_customer_id) {
                await bindLinkSession(client, String(result.crypto_customer_id))
                await apiFetch('/api/stripe/onramp/link-complete', {
                  method: 'POST',
                  body: {
                    cryptoCustomerId: result.crypto_customer_id,
                    accessToken: result.access_token || result.oauth_token,
                    authIntentId: intentId,
                  },
                })
              }
            })
            return true
          })()
          if (!authed) return true
        }
        try {
          await client.submitKycInfo?.(
            buildExpressKycSubmitInfo({
              form,
              country: lockedCountry,
              includeUsSsn: step === 'us_kyc',
              eu: step === 'eu_kyc',
            }),
          )
        } catch (e) {
          if (!isExpressKycAlreadyVerified(e instanceof Error ? e.message : String(e))) throw e
        }
        advanceLocal(expressDepositsAdvanceAfter({ completed: step, payerCountry: lockedCountry }))
        if (step === 'us_kyc') void pollUntilNotReview()
        else void refresh(true)
        return true
      }
      if (step === 'eu_identifiers') {
        const missing = await client.getMissingIdentifiers?.()
        const type = missing?.identifiers?.[0]?.type
        if (type) {
          await client.updateKycInfo?.({
            identifiers: [{ type, value: form.identifier }],
          })
        }
        advanceLocal(expressDepositsAdvanceAfter({ completed: 'eu_identifiers', payerCountry: lockedCountry }))
        return
      }
      if (step === 'eu_attestation') {
        const el = await client.promptUserAttestation?.((result) => {
          const outcome = String(result.result || '')
          if (outcome === 'success' || outcome === 'accepted') {
            setStripeEl(null)
            setMessage(null)
            advanceLocal(expressDepositsAdvanceAfter({ completed: 'eu_attestation', payerCountry: lockedCountry }))
            void refresh(true)
          } else if (isExpressSetupDismissed(outcome)) {
            setStripeEl(null)
            setMessage(null)
            showInfo(EXPRESS_DEPOSITS_COPY.setupDismissed, 5000)
          }
        })
        if (isStripeHostElement(el)) {
          setStripeEl(el)
          return true
        }
        return
      }
      if (step === 'wallet') {
        const registered = await apiFetch<{ walletAddress?: string; registered?: boolean }>(
          '/api/stripe/onramp/wallets/register',
          { method: 'POST' },
        )
        if (!registered.registered) {
          const walletAddress = String(registered.walletAddress || '').trim()
          if (!walletAddress || !client.registerWalletAddress) {
            throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
          }
          if (client.authenticate) {
            const auth = await apiFetch<{ authIntentId?: string | null }>(
              '/api/stripe/onramp/link-auth',
              { method: 'POST', body: linkAuthBody() },
            )
            const intentId = auth.authIntentId
            if (intentId) {
              if (Platform.OS === 'web') {
                const ok = await new Promise<boolean>((resolve, reject) => {
                  void client
                    .authenticate!(intentId, async (result) => {
                      const outcome = String(result.result || '')
                      if (outcome === 'success') {
                        if (result.crypto_customer_id) {
                          await bindLinkSession(client, String(result.crypto_customer_id))
                        }
                        setStripeEl(null)
                        resolve(true)
                        return
                      }
                      setStripeEl(null)
                      resolve(false)
                    })
                    .then((el) => {
                      if (isStripeHostElement(el)) setStripeEl(el)
                    })
                    .catch(reject)
                })
                if (!ok) return true
              } else {
                await client.authenticate(intentId, async (result) => {
                  if (String(result.result || '') === 'success' && result.crypto_customer_id) {
                    await bindLinkSession(client, String(result.crypto_customer_id))
                  }
                })
              }
            }
          }
          await client.registerWalletAddress(walletAddress, 'solana')
        }
        advanceLocal('ready')
      }
    })
  }

  useEffect(() => {
    if (step !== 'us_l2' && step !== 'eu_l2') {
      l2StartedRef.current = false
      return
    }
    if (l2StartedRef.current) return
    l2StartedRef.current = true
    setOpeningIdentity(true)
    onCta()
  }, [step])

  useEffect(() => {
    if (!isExpressReviewSetupStep(step)) return
    setOpeningIdentity(false)
    const id = setInterval(() => {
      void refresh(true).catch(() => undefined)
    }, 2500)
    return () => clearInterval(id)
  }, [step, refresh])

  useEffect(() => {
    if (step !== 'us_l2' && step !== 'eu_l2') return
    return watchExpressIdentityOverlay({
      onOpen: () => {
        if (!watchIdentityOverlayRef.current) return
        setOpeningIdentity(false)
        setBusy(false)
      },
      onClosed: () => {
        if (!watchIdentityOverlayRef.current) return
        dismissL2Ref.current()
      },
    })
  }, [step])

  return (
    <ScreenWrapper>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              haptics.tap()
              handleBack()
            }}
            style={({ pressed }) => [
              styles.backButton,
              pressed && Platform.OS === 'ios' && styles.backButtonPressed,
            ]}
            android_ripple={{ color: 'rgba(0, 0, 0, 0.12)', borderless: false }}
          >
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>{EXPRESS_DEPOSITS_COPY.title}</Text>
          </View>
        </View>
        <View style={styles.bodySlot}>
          {Platform.OS === 'web' && (step === 'link' || step === 'us_l2' || step === 'eu_l2') ? (
            <View style={[styles.hostWrap, !stripeEl && styles.hostHidden]}>
              <ExpressStripeHost element={stripeEl} />
            </View>
          ) : stripeEl ? (
            <View style={styles.hostWrap}>
              <ExpressStripeHost element={stripeEl} />
            </View>
          ) : null}
          {!stripeEl || Platform.OS !== 'web' ? (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {step === 'link' ? (
                <View style={styles.profileCard}>
                  {field('email', 'Email', { keyboard: 'email', autoCapitalize: 'none' })}
                  {field('phone', 'Phone number', { keyboard: 'phone' })}
                  {field('given_name', 'First name')}
                  {field('surname', 'Last name')}
                </View>
              ) : null}
              {step === 'us_kyc' || step === 'eu_kyc' ? (
                <View style={styles.profileCard}>
                  <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.kycHint}</Text>
                  {field('given_name', 'First name')}
                  {field('surname', 'Last name')}
                  {field('line1', 'Address')}
                  {field('city', 'City')}
                  {step === 'us_kyc'
                    ? field('state', 'State')
                    : lockedCountry === 'IE'
                      ? field('state', 'County')
                      : null}
                  {field('postal_code', 'Postal code')}
                  {field('dob_day', 'Birth day', { keyboard: 'number' })}
                  {field('dob_month', 'Birth month', { keyboard: 'number' })}
                  {field('dob_year', 'Birth year', { keyboard: 'number' })}
                  {step === 'us_kyc' ? (
                    <>
                      {field('ssn', EXPRESS_DEPOSITS_COPY.ssnLabel, {
                        keyboard: 'number',
                        autoCapitalize: 'none',
                        secure: true,
                      })}
                      <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.ssnHint}</Text>
                    </>
                  ) : null}
                  {step === 'eu_kyc' ? (
                    <>
                      {field('nationalities', EXPRESS_DEPOSITS_COPY.nationalitiesLabel)}
                      {field('birth_city', EXPRESS_DEPOSITS_COPY.birthCityLabel)}
                      {field('birth_country', EXPRESS_DEPOSITS_COPY.birthCountryLabel)}
                    </>
                  ) : null}
                </View>
              ) : null}
              {step === 'eu_identifiers' ? (
                <View style={styles.profileCard}>
                  <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.identifierHint}</Text>
                  {field('identifier', 'ID number')}
                </View>
              ) : null}

              {step === 'eu_attestation' ? (
                <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.acceptTermsHint}</Text>
              ) : null}

              {isExpressReviewSetupStep(step) ? (
                <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.reviewHint}</Text>
              ) : null}

              {step === 'us_l2' || step === 'eu_l2' ? (
                <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.identityHint}</Text>
              ) : null}

              {step === 'ready' ? (
                <View style={styles.readyBlock}>
                  <Text style={styles.readyTitle}>{EXPRESS_DEPOSITS_COPY.readyTitle}</Text>
                  <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.readyBody}</Text>
                  <GlossyPrimaryButton
                    title={EXPRESS_DEPOSITS_COPY.addMoneyCta}
                    onPress={() => {
                      haptics.medium()
                      exitExpressSetupToAddMoney(navigation)
                    }}
                  />
                </View>
              ) : null}

              {cta ? (
                openingIdentity || (busy && (step === 'us_l2' || step === 'eu_l2')) ? (
                  <View style={styles.ctaBusy}>
                    <ActivityIndicator color={colors.neutral.white} />
                    <Text style={styles.ctaBusyLabel}>{EXPRESS_DEPOSITS_COPY.openingCta}</Text>
                  </View>
                ) : busy ? (
                  <View style={styles.ctaBusy}>
                    <ActivityIndicator color={colors.neutral.white} />
                  </View>
                ) : (
                  <GlossyPrimaryButton title={cta} onPress={onCta} />
                )
              ) : isExpressReviewSetupStep(step) ? (
                <View style={styles.ctaBusy}>
                  <ActivityIndicator color={colors.neutral.white} />
                </View>
              ) : null}
              {message ? <Text style={styles.error}>{message}</Text> : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_FLOW_MAX_WIDTH,
    alignSelf: 'center',
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
  backButtonPressed: {
    opacity: 0.7,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    marginBottom: 2,
    ...Platform.select({
      android: {
        lineHeight: Math.round(fontSize.xl * lineHeightScale.snug) + 4,
        includeFontPadding: false,
      },
      default: {},
    }),
  },
  bodySlot: {
    flex: 1,
    minHeight: 0,
  },
  hostWrap: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing[5],
    ...Platform.select({
      web: { overflow: 'hidden' as const },
      default: {},
    }),
  },
  hostHidden: {
    ...Platform.select({
      web: {
        position: 'absolute' as const,
        width: 1,
        height: 1,
        overflow: 'hidden' as const,
        opacity: 0,
        pointerEvents: 'none' as const,
      },
      default: {},
    }),
  },
  body: {
    padding: spacing[5],
    gap: spacing[4],
  },
  bodyText: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  profileCard: {
    ...surfaceFrameStyle(colors),
    padding: spacing[4],
  },
  fieldContainer: {
    marginBottom: spacing[3],
  },
  fieldLabel: {
    ...textStyles.labelSmall,
    color: colors.text.secondary,
    marginBottom: spacing[1],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileFieldBox: {
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[3],
    height: 40,
    minHeight: 40,
    maxHeight: 40,
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  profileFieldBoxEditable: {
    backgroundColor: colors.background.primary,
  },
  fieldBoxInner: {
    width: '100%',
    height: 20,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  fieldBoxInput: {
    ...textStyles.bodyLarge,
    width: '100%',
    height: 20,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontWeight: '500',
    lineHeight: 20,
    color: colors.text.primary,
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center', paddingVertical: 0 },
      ios: { paddingVertical: 0, marginTop: 0, marginBottom: 0 },
      web: { outlineStyle: 'none', paddingVertical: 0 },
      default: { paddingVertical: 0 },
    }),
  },
  ctaBusy: {
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.full,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[5],
  },
  ctaBusyLabel: {
    ...textStyles.titleMedium,
    color: colors.neutral.white,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: -0.1,
  },
  readyBlock: {
    gap: spacing[3],
  },
  readyTitle: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.error.main,
  },
})
