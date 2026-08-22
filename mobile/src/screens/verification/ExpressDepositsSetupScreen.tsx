import React, { useCallback, useEffect, useState } from 'react'
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
  expressSetupUserMessage,
  isExpressSetupDismissed,
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
import { navigateStackBack } from '../../navigation/stackBackNavigation'
import { apiFetch } from '../../query/api-client'
import { WEB_FLOW_MAX_WIDTH } from '../../components/layout/CenteredWebFlowPage'
import { loadMobileExpressOnramp, type ExpressOnrampSdk } from '../../lib/express-onramp'
import { isStripeHostElement } from '../../lib/expressStripeElement'
import { ExpressStripeHost } from '../../components/receive/ExpressStripeHost'
import { useAuth } from '../../contexts/AuthContext'
import {
  cacheExpressOnrampStatus,
  fetchExpressOnrampStatus,
  peekExpressOnrampStatus,
  type ExpressOnrampStatus,
} from '../../lib/expressOnrampStatusCache'
import {
  expressFormFromProfile,
  expressFormFromStatusPrefill,
  expressLockedCountry,
  mergeExpressForm,
} from '../../lib/expressSetupForm'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'

export default function ExpressDepositsSetupScreen({ navigation }: NavigationProps) {
  const { userProfile } = useAuth()
  const [status, setStatus] = useState<ExpressOnrampStatus | null>(() => peekExpressOnrampStatus())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>(() =>
    mergeExpressForm(
      expressFormFromProfile({
        ...userProfile?.profile,
        email: userProfile?.email ?? userProfile?.profile?.email,
        phone: userProfile?.profile?.phone,
      }),
      expressFormFromStatusPrefill(peekExpressOnrampStatus()?.prefill, peekExpressOnrampStatus()?.payerCountry),
    ),
  )
  const [sdk, setSdk] = useState<ExpressOnrampSdk | null>(null)
  const [stripeEl, setStripeEl] = useState<unknown>(null)

  const handleBack = useCallback(() => navigateStackBack(navigation), [navigation])
  useStackHardwareBack(handleBack)

  const applyStatus = useCallback((data: ExpressOnrampStatus) => {
    cacheExpressOnrampStatus(data)
    setStatus(data)
    if (!data.eligible) setMessage(EXPRESS_DEPOSITS_COPY.geoUnavailable)
    setForm((prev) => mergeExpressForm(prev, expressFormFromStatusPrefill(data.prefill, data.payerCountry)))
  }, [])

  const refresh = useCallback(async (force = false) => {
    const data = await fetchExpressOnrampStatus(force)
    applyStatus(data)
    return data
  }, [applyStatus])

  useEffect(() => {
    void refresh(false).catch((e) =>
      setMessage(e instanceof Error ? e.message : EXPRESS_DEPOSITS_COPY.geoUnavailable),
    )
  }, [refresh])

  const lockedCountry = expressLockedCountry(form, status?.payerCountry)
  const step: ExpressDepositsNextStep = status?.nextStep ?? 'link'

  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true)
    setMessage(null)
    try {
      const keepOpen = await fn()
      if (!keepOpen) await refresh(true)
    } catch (e) {
      setMessage(expressSetupUserMessage(e instanceof Error ? e.message : null))
    } finally {
      setBusy(false)
    }
  }

  const ensureSdk = async () => {
    if (sdk) return sdk
    const data = await refresh(true)
    if (!data.publishableKey) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
    const client = await loadMobileExpressOnramp(data.publishableKey)
    setSdk(client)
    return client
  }

  const field = (
    key: string,
    label: string,
    opts?: { keyboard?: 'email' | 'phone' | 'number'; autoCapitalize?: 'none' | 'words' },
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
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>
      </View>
    </View>
  )

  const cta =
    step === 'ready'
      ? null
      : step === 'wallet'
        ? 'Finish setup'
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
          { method: 'POST', body: {} },
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
            { method: 'POST', body: {} },
          )
          intentId = again.authIntentId
        }
        if (intentId && client.authenticate) {
          const el = await client.authenticate(intentId, async (result) => {
            const outcome = String(result.result || '')
            if (outcome === 'success' && result.crypto_customer_id) {
              await apiFetch('/api/stripe/onramp/link-complete', {
                method: 'POST',
                body: {
                  cryptoCustomerId: result.crypto_customer_id,
                  accessToken: result.access_token || result.oauth_token,
                },
              })
              setStripeEl(null)
              setMessage(null)
              await refresh(true)
            } else if (isExpressSetupDismissed(outcome)) {
              setStripeEl(null)
              setMessage(EXPRESS_DEPOSITS_COPY.setupDismissed)
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
      if (step === 'us_kyc' || step === 'eu_kyc') {
        await client.submitKycInfo?.({
          given_name: form.given_name,
          surname: form.surname,
          date_of_birth: {
            day: Number(form.dob_day) || undefined,
            month: Number(form.dob_month) || undefined,
            year: Number(form.dob_year) || undefined,
          },
          address: {
            line1: form.line1,
            city: form.city,
            state: form.state,
            postal_code: form.postal_code,
            country: lockedCountry,
          },
          ...(step === 'eu_kyc'
            ? {
                nationalities: form.nationalities.split(/[\s,]+/).filter(Boolean),
                birth_city: form.birth_city,
                birth_country: form.birth_country,
              }
            : {}),
        })
        return
      }
      if (step === 'eu_identifiers') {
        const missing = await client.getMissingIdentifiers?.()
        const type = missing?.identifiers?.[0]?.type
        await client.updateKycInfo?.({
          identifiers: type ? [{ type, value: form.identifier }] : [],
        })
        return
      }
      if (step === 'eu_attestation') {
        const el = await client.promptUserAttestation?.((result) => {
          const outcome = String(result.result || '')
          if (outcome === 'success' || outcome === 'accepted') {
            setStripeEl(null)
            setMessage(null)
            void refresh(true)
          } else if (isExpressSetupDismissed(outcome)) {
            setStripeEl(null)
            setMessage(EXPRESS_DEPOSITS_COPY.setupDismissed)
          }
        })
        if (isStripeHostElement(el)) {
          setStripeEl(el)
          return true
        }
        return
      }
      if (step === 'us_l2' || step === 'eu_l2') {
        const el = await client.verifyDocuments?.((result) => {
          const outcome = result && typeof result === 'object' ? String((result as { result?: string }).result || '') : ''
          setStripeEl(null)
          if (isExpressSetupDismissed(outcome)) {
            setMessage(EXPRESS_DEPOSITS_COPY.setupDismissed)
            return
          }
          setMessage(null)
          void refresh(true)
        })
        if (isStripeHostElement(el)) {
          setStripeEl(el)
          return true
        }
        return
      }
      if (step === 'wallet') {
        await apiFetch('/api/stripe/onramp/wallets/register', { method: 'POST' })
      }
    })
  }

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
          {stripeEl ? (
            <View style={styles.hostWrap}>
              <ExpressStripeHost element={stripeEl} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.description}</Text>
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
                  {field('given_name', 'First name')}
                  {field('surname', 'Last name')}
                  {field('line1', 'Address')}
                  {field('city', 'City')}
                  {field('postal_code', 'Postal code')}
                  {field('dob_day', 'Birth day', { keyboard: 'number' })}
                  {field('dob_month', 'Birth month', { keyboard: 'number' })}
                  {field('dob_year', 'Birth year', { keyboard: 'number' })}
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
                <View style={styles.profileCard}>{field('identifier', 'ID number')}</View>
              ) : null}

              {step === 'eu_attestation' ? (
                <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.acceptTermsHint}</Text>
              ) : null}

              {step === 'us_l2' || step === 'eu_l2' ? (
                <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.identityHint}</Text>
              ) : null}

              {step === 'ready' ? <Text style={styles.ready}>{EXPRESS_DEPOSITS_COPY.readyBadge}</Text> : null}

              {cta ? (
                busy ? (
                  <View style={styles.ctaBusy}>
                    <ActivityIndicator color={colors.neutral.white} />
                  </View>
                ) : (
                  <GlossyPrimaryButton title={cta} onPress={onCta} />
                )
              ) : null}
              {message ? (
                <Text style={message === EXPRESS_DEPOSITS_COPY.setupDismissed ? styles.hint : styles.error}>
                  {message}
                </Text>
              ) : null}
            </ScrollView>
          )}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  ready: {
    ...textStyles.bodyMedium,
    color: colors.success.dark,
  },
  hint: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.error.main,
  },
})
