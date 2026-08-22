import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable, TextInput, ScrollView } from 'react-native'
import { EXPRESS_DEPOSITS_COPY, type ExpressDepositsNextStep } from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles } from '../../theme'
import { ReceiveFlowHeader } from '../../components/receive/ReceiveFlowHeader'
import { useStackHardwareBack } from '../../hooks/useStackHardwareBack'
import { navigateStackBack } from '../../navigation/stackBackNavigation'
import { apiFetch } from '../../query/api-client'
import { CenteredWebFlowPage } from '../../components/layout/CenteredWebFlowPage'
import { loadMobileExpressOnramp, type ExpressOnrampSdk } from '../../lib/express-onramp'

type Status = {
  ready?: boolean
  nextStep?: ExpressDepositsNextStep
  publishableKey?: string
  prefill?: Record<string, unknown>
  payerCountry?: string | null
  eligible?: boolean
}

export default function ExpressDepositsSetupScreen({ navigation }: NavigationProps) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [sdk, setSdk] = useState<ExpressOnrampSdk | null>(null)

  const handleBack = useCallback(() => navigateStackBack(navigation), [navigation])
  useStackHardwareBack(handleBack)

  const refresh = useCallback(async () => {
    const data = await apiFetch<Status>('/api/stripe/onramp/status')
    if (!data.eligible) {
      setMessage(EXPRESS_DEPOSITS_COPY.geoUnavailable)
    }
    setStatus(data)
    const pre = data.prefill || {}
    const address = (pre.address as Record<string, unknown>) || {}
    const dob = (pre.date_of_birth as Record<string, unknown>) || {}
    setForm((prev) => ({
      given_name: prev.given_name || String(pre.given_name || ''),
      surname: prev.surname || String(pre.surname || ''),
      email: prev.email || String(pre.email || ''),
      phone: prev.phone || String(pre.phone || ''),
      line1: prev.line1 || String(address.line1 || ''),
      city: prev.city || String(address.city || ''),
      state: prev.state || String(address.state || ''),
      postal_code: prev.postal_code || String(address.postal_code || ''),
      country: prev.country || String(address.country || data.payerCountry || ''),
      dob_day: prev.dob_day || String(dob.day || ''),
      dob_month: prev.dob_month || String(dob.month || ''),
      dob_year: prev.dob_year || String(dob.year || ''),
      nationalities: prev.nationalities || String(address.country || data.payerCountry || ''),
      birth_city: prev.birth_city || '',
      birth_country: prev.birth_country || String(address.country || data.payerCountry || ''),
      identifier: prev.identifier || '',
    }))
    if (data.publishableKey && !sdk) {
      setSdk(await loadMobileExpressOnramp(data.publishableKey))
    }
    return data
  }, [sdk])

  useEffect(() => {
    void refresh().catch((e) => setMessage(e instanceof Error ? e.message : EXPRESS_DEPOSITS_COPY.geoUnavailable))
  }, [refresh])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : EXPRESS_DEPOSITS_COPY.somethingWentWrong)
    } finally {
      setBusy(false)
    }
  }

  const step = status?.nextStep ?? 'link'

  const field = (key: string, label: string) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={form[key] || ''}
        onChangeText={(v) => setForm((p) => ({ ...p, [key]: v }))}
        autoCapitalize="none"
      />
    </View>
  )

  const cta =
    step === 'ready'
      ? 'Done'
      : step === 'wallet'
        ? 'Finish setup'
        : step === 'us_l2' || step === 'eu_l2'
          ? EXPRESS_DEPOSITS_COPY.verifyCta
          : step === 'link'
            ? EXPRESS_DEPOSITS_COPY.setupCta
            : EXPRESS_DEPOSITS_COPY.continueCta

  return (
    <ScreenWrapper>
      <CenteredWebFlowPage>
        <ReceiveFlowHeader title={EXPRESS_DEPOSITS_COPY.title} onBack={handleBack} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.description}</Text>
          {!status ? <ActivityIndicator color={colors.primary.main} /> : null}

          {step === 'link' ? (
            <>
              {field('email', 'Email')}
              {field('phone', 'Phone')}
              {field('given_name', 'First name')}
              {field('surname', 'Last name')}
              {field('country', 'Country')}
            </>
          ) : null}

          {step === 'us_kyc' || step === 'eu_kyc' ? (
            <>
              {field('given_name', 'First name')}
              {field('surname', 'Last name')}
              {field('line1', 'Address')}
              {field('city', 'City')}
              {field('postal_code', 'Postal code')}
              {field('country', 'Country')}
              {field('dob_day', 'Birth day')}
              {field('dob_month', 'Birth month')}
              {field('dob_year', 'Birth year')}
              {step === 'eu_kyc' ? (
                <>
                  {field('nationalities', EXPRESS_DEPOSITS_COPY.nationalitiesLabel)}
                  {field('birth_city', EXPRESS_DEPOSITS_COPY.birthCityLabel)}
                  {field('birth_country', EXPRESS_DEPOSITS_COPY.birthCountryLabel)}
                </>
              ) : null}
            </>
          ) : null}

          {step === 'eu_identifiers' ? field('identifier', 'ID number') : null}

          {step === 'eu_attestation' ? (
            <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.acceptTermsHint}</Text>
          ) : null}

          {step === 'us_l2' || step === 'eu_l2' ? (
            <Text style={styles.bodyText}>{EXPRESS_DEPOSITS_COPY.identityHint}</Text>
          ) : null}

          {step === 'ready' ? <Text style={styles.ready}>{EXPRESS_DEPOSITS_COPY.readyBadge}</Text> : null}

          {cta && step !== 'ready' ? (
            <Pressable
              style={styles.cta}
              disabled={busy}
              onPress={() => {
                void run(async () => {
                  if (step === 'link') {
                    const auth = await apiFetch<{ authIntentId?: string | null; needsRegister?: boolean }>(
                      '/api/stripe/onramp/link-auth',
                      { method: 'POST', body: {} },
                    )
                    if (auth.needsRegister) {
                      await sdk?.registerLinkUser?.({
                        email: form.email,
                        phone: form.phone,
                        country: form.country,
                        fullName: `${form.given_name} ${form.surname}`.trim(),
                      })
                    }
                    const intentId = auth.authIntentId
                    if (intentId && sdk?.authenticate) {
                      await new Promise<void>((resolve, reject) => {
                        void sdk.authenticate?.(intentId, async (result) => {
                          if (result.result === 'success' && result.crypto_customer_id) {
                            await apiFetch('/api/stripe/onramp/link-complete', {
                              method: 'POST',
                              body: {
                                cryptoCustomerId: result.crypto_customer_id,
                                accessToken: result.access_token || result.oauth_token,
                              },
                            })
                            resolve()
                          } else if (result.result && result.result !== 'success') {
                            reject(new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong))
                          }
                        })
                      })
                    }
                    return
                  }
                  if (step === 'us_kyc' || step === 'eu_kyc') {
                    await sdk?.submitKycInfo?.({
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
                        country: form.country,
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
                    const missing = await sdk?.getMissingIdentifiers?.()
                    const type = missing?.identifiers?.[0]?.type
                    await sdk?.updateKycInfo?.({
                      identifiers: type ? [{ type, value: form.identifier }] : [],
                    })
                    return
                  }
                  if (step === 'eu_attestation') {
                    await sdk?.promptUserAttestation?.(() => undefined)
                    return
                  }
                  if (step === 'us_l2' || step === 'eu_l2') {
                    await sdk?.verifyDocuments?.()
                    return
                  }
                  if (step === 'wallet') {
                    await apiFetch('/api/stripe/onramp/wallets/register', { method: 'POST' })
                  }
                })
              }}
            >
              {busy ? (
                <ActivityIndicator color={colors.neutral.white} />
              ) : (
                <Text style={styles.ctaText}>{cta}</Text>
              )}
            </Pressable>
          ) : null}
          {message ? <Text style={styles.error}>{message}</Text> : null}
        </ScrollView>
      </CenteredWebFlowPage>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  body: {
    padding: spacing[5],
    gap: spacing[4],
  },
  bodyText: {
    ...textStyles.body,
    color: colors.text.secondary,
  },
  field: { gap: spacing[1] },
  label: { ...textStyles.bodySmall, color: colors.text.secondary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing[3],
    color: colors.text.primary,
  },
  cta: {
    backgroundColor: colors.primary.main,
    borderRadius: 12,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  ctaText: {
    ...textStyles.bodyMedium,
    color: colors.neutral.white,
    fontWeight: '600',
  },
  ready: {
    ...textStyles.bodyMedium,
    color: colors.success.dark,
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.error.main,
  },
})
