"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  EXPRESS_DEPOSITS_COPY,
  buildExpressKycSubmitInfo,
  expressIdentityOutcome,
  expressSetupUserMessage,
  isExpressIdentitySuccess,
  isExpressIdentitySetupStep,
  isExpressKycAlreadyVerified,
  isExpressReviewSetupStep,
  isExpressSetupDismissed,
  isUsSsnComplete,
  qk,
  toExpressLinkE164Phone,
  type ExpressDepositsNextStep,
} from "@easner/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { Loader2 } from "lucide-react"
import { loadExpressOnramp, prefetchExpressOnramp, configureExpressOnrampLinkSession, type CryptoOnrampClient } from "@/lib/stripe/load-crypto-onramp"
import {
  fetchBusinessExpressOnrampStatus,
  peekBusinessExpressOnrampStatus,
} from "@/lib/express-onramp-status-cache"
import { useAuth } from "@/lib/auth-context"
import { useMaybeScope } from "@/lib/query/scope"
import { useQueryClient } from "@tanstack/react-query"
import { ExpressDepositsStripeSlot } from "@/components/compliance/express-deposits-stripe-slot"
import { mapStripeOnrampError } from "@/lib/stripe/onramp-sdk-map"
import { toast } from "sonner"

const SCOPE = { "X-Easner-Account-Scope": "business" } as const

type Status = {
  ready?: boolean
  nextStep?: ExpressDepositsNextStep
  publishableKey?: string
  prefill?: Record<string, unknown>
  payerCountry?: string | null
  eligible?: boolean
  cryptoCustomerId?: string | null
  error?: string
}

type Props = { onClose: () => void }

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

export function ExpressDepositsSetup({ onClose }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const scope = useMaybeScope()
  const { user } = useAuth()
  const [status, setStatus] = useState<Status | null>(() => peekBusinessExpressOnrampStatus() as Status | null)
  const [busy, setBusy] = useState(false)
  const [openingIdentity, setOpeningIdentity] = useState(() => {
    const peeked = peekBusinessExpressOnrampStatus()
    return isExpressIdentitySetupStep(peeked?.nextStep)
  })
  const [message, setMessage] = useState<string | null>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [sdk, setSdk] = useState<CryptoOnrampClient | null>(null)
  const l2StartedRef = useRef(false)

  const refresh = useCallback(async () => {
    const data = (await fetchBusinessExpressOnrampStatus(true, user?.id)) as Status
    if (data.error && !data.publishableKey) {
      setMessage(data.error || EXPRESS_DEPOSITS_COPY.geoUnavailable)
      return data
    }
    if (scope) queryClient.setQueryData(qk.verification.expressOnramp(scope), data)
    setStatus(data)
    const pre = asRecord(data.prefill)
    const address = asRecord(pre.address)
    const dob = asRecord(pre.date_of_birth)
    setForm((prev) => ({
      given_name: prev.given_name || String(pre.given_name || ""),
      surname: prev.surname || String(pre.surname || ""),
      email: prev.email || String(pre.email || ""),
      phone: prev.phone || String(pre.phone || ""),
      line1: prev.line1 || String(address.line1 || ""),
      city: prev.city || String(address.city || ""),
      state: prev.state || String(address.state || ""),
      postal_code: prev.postal_code || String(address.postal_code || ""),
      country: prev.country || String(address.country || data.payerCountry || ""),
      dob_day: prev.dob_day || String(dob.day || ""),
      dob_month: prev.dob_month || String(dob.month || ""),
      dob_year: prev.dob_year || String(dob.year || ""),
      nationalities: prev.nationalities || String(address.country || data.payerCountry || ""),
      birth_city: prev.birth_city || "",
      birth_country: prev.birth_country || String(address.country || data.payerCountry || ""),
      identifier: prev.identifier || "",
      ssn: prev.ssn || "",
    }))
    return data
  }, [queryClient, scope, user?.id])

  useEffect(() => {
    const peeked = peekBusinessExpressOnrampStatus()
    if (peeked?.publishableKey) void loadExpressOnramp(peeked.publishableKey).catch(() => undefined)
    else prefetchExpressOnramp()
    void refresh()
  }, [refresh])

  const pollUntilNotReview = async () => {
    let data = await refresh()
    for (let i = 0; i < 12 && isExpressReviewSetupStep(data.nextStep); i += 1) {
      await new Promise((r) => setTimeout(r, 2500))
      data = await refresh()
    }
    return data
  }

  const persistLink = async (
    cryptoCustomerId: string,
    opts?: { accessToken?: string; authIntentId?: string },
    client?: CryptoOnrampClient,
  ) => {
    if (client) await configureExpressOnrampLinkSession(client, cryptoCustomerId)
    await fetchWithSession("/api/stripe/onramp/link-complete", {
      method: "POST",
      headers: { ...SCOPE, "Content-Type": "application/json" },
      body: JSON.stringify({
        cryptoCustomerId,
        accessToken: opts?.accessToken,
        authIntentId: opts?.authIntentId,
      }),
    })
  }

  const ensureSdk = async () => {
    const pk = status?.publishableKey || peekBusinessExpressOnrampStatus()?.publishableKey
    const data = pk ? status : await refresh()
    const key = pk || data?.publishableKey
    if (!key) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
    const customerId =
      status?.cryptoCustomerId ??
      data?.cryptoCustomerId ??
      peekBusinessExpressOnrampStatus()?.cryptoCustomerId ??
      null
    const client = await loadExpressOnramp(key, customerId)
    setSdk(client)
    return client
  }

  /** SDK verifyDocuments needs a live Link session in this browser, even when cryptoCustomerId exists. */
  const ensureLinkSession = async (client: CryptoOnrampClient): Promise<boolean> => {
    const linkEmail =
      form.email.trim() ||
      String(status?.prefill?.email || peekBusinessExpressOnrampStatus()?.prefill?.email || "")
    const auth = await fetchWithSession("/api/stripe/onramp/link-auth", {
      method: "POST",
      headers: { ...SCOPE, "Content-Type": "application/json" },
      body: JSON.stringify({ email: linkEmail || undefined }),
    })
    const authJson = (await auth.json().catch(() => ({}))) as {
      authIntentId?: string
      needsRegister?: boolean
    }
    let intentId = authJson.authIntentId
    if (authJson.needsRegister || !intentId) {
      const country = status?.payerCountry || form.country
      await client.registerLinkUser(
        form.email.trim(),
        toExpressLinkE164Phone(form.phone, country),
        country,
        `${form.given_name} ${form.surname}`.trim(),
      )
      const again = await fetchWithSession("/api/stripe/onramp/link-auth", {
        method: "POST",
        headers: { ...SCOPE, "Content-Type": "application/json" },
        body: JSON.stringify({ email: linkEmail || undefined }),
      })
      const againJson = (await again.json().catch(() => ({}))) as { authIntentId?: string }
      intentId = againJson.authIntentId
    }
    if (!intentId) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)

    return new Promise((resolve, reject) => {
      void client
        .authenticate(intentId!, async (result) => {
          const outcome = String(result.result || "")
          if (outcome === "success") {
            if (result.crypto_customer_id) {
              await persistLink(result.crypto_customer_id, {
                accessToken: result.access_token || result.oauth_token,
                authIntentId: intentId,
              }, client)
            }
            setSlot(null)
            resolve(true)
            return
          }
          if (isExpressSetupDismissed(outcome)) {
            setSlot(null)
            resolve(false)
            return
          }
          setSlot(null)
          reject(new Error(expressSetupUserMessage(outcome)))
        })
        .then((el) => {
          if (el) setSlot(el)
        })
        .catch(reject)
    })
  }

  const closeHost = (message?: string | null) => {
    setSlot(null)
    if (message === EXPRESS_DEPOSITS_COPY.setupDismissed) {
      setOpeningIdentity(false)
      toast.message(EXPRESS_DEPOSITS_COPY.setupDismissed)
      setMessage(null)
      return
    }
    setMessage(message ?? null)
  }

  const onHostResult = async (result: {
    result?: string
    crypto_customer_id?: string
    access_token?: string
    oauth_token?: string
    auth_intent_id?: string
  }) => {
    const outcome = String(result.result || "")
    if (outcome === "success" && result.crypto_customer_id) {
      await persistLink(result.crypto_customer_id, {
        accessToken: result.access_token || result.oauth_token,
        authIntentId: result.auth_intent_id,
      }, sdk ?? undefined)
      closeHost(null)
      await refresh()
      return
    }
    if (isExpressSetupDismissed(outcome)) {
      closeHost(EXPRESS_DEPOSITS_COPY.setupDismissed)
      return
    }
    if (outcome && outcome !== "success") {
      closeHost(expressSetupUserMessage(outcome))
    }
  }

  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true)
    setMessage(null)
    try {
      const keepOpen = await fn()
      if (!keepOpen) await refresh()
    } catch (e) {
      setOpeningIdentity(false)
      setMessage(expressSetupUserMessage(e instanceof Error ? e.message : null))
    } finally {
      setBusy(false)
    }
  }

  const step = status?.nextStep ?? "link"

  const startLink = () =>
    void run(async () => {
      const client = await ensureSdk()
      const linkEmail =
        form.email.trim() ||
        String(status?.prefill?.email || peekBusinessExpressOnrampStatus()?.prefill?.email || "")
      const auth = await fetchWithSession("/api/stripe/onramp/link-auth", {
        method: "POST",
        headers: { ...SCOPE, "Content-Type": "application/json" },
        body: JSON.stringify({ email: linkEmail || undefined }),
      })
      const authJson = (await auth.json().catch(() => ({}))) as {
        authIntentId?: string
        needsRegister?: boolean
        error?: string
      }
      if (authJson.needsRegister || !authJson.authIntentId) {
        const country = status?.payerCountry || form.country
        await client.registerLinkUser(
          form.email.trim(),
          toExpressLinkE164Phone(form.phone, country),
          country,
          `${form.given_name} ${form.surname}`.trim(),
        )
        const again = await fetchWithSession("/api/stripe/onramp/link-auth", {
          method: "POST",
          headers: { ...SCOPE, "Content-Type": "application/json" },
          body: JSON.stringify({ email: linkEmail || undefined }),
        })
        const againJson = (await again.json().catch(() => ({}))) as { authIntentId?: string }
        if (!againJson.authIntentId) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
        const el = await client.authenticate(againJson.authIntentId, (result) =>
          onHostResult({ ...result, auth_intent_id: againJson.authIntentId }),
        )
        setSlot(el)
        return true
      }
      const el = await client.authenticate(authJson.authIntentId, (result) =>
        onHostResult({ ...result, auth_intent_id: authJson.authIntentId }),
      )
      setSlot(el)
      return true
    })

  const submitKyc = () =>
    void run(async () => {
      if (step === "us_kyc" && !isUsSsnComplete(form.ssn)) {
        throw new Error(EXPRESS_DEPOSITS_COPY.ssnHint)
      }
      const sdk = await ensureSdk()
      const authed = await ensureLinkSession(sdk)
      if (!authed) {
        closeHost(EXPRESS_DEPOSITS_COPY.setupDismissed)
        return true
      }
      try {
        await sdk.submitKycInfo(
          buildExpressKycSubmitInfo({
            form,
            country: status?.payerCountry || form.country,
            includeUsSsn: step === "us_kyc",
            eu: step.startsWith("eu"),
          }),
        )
      } catch (e) {
        if (!isExpressKycAlreadyVerified(e instanceof Error ? e.message : String(e))) throw e
      }
      if (step === "us_kyc") await pollUntilNotReview()
      else await refresh()
    })

  const submitIdentifiers = () =>
    void run(async () => {
      const sdk = await ensureSdk()
      if (!sdk.getMissingIdentifiers || !sdk.updateKycInfo) {
        throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      }
      const missing = await sdk.getMissingIdentifiers()
      const type = missing.identifiers?.[0]?.type
      if (type) {
        await sdk.updateKycInfo({
          identifiers: [{ type, value: form.identifier }],
        })
      }
    })

  const startAttestation = () =>
    void run(async () => {
      const sdk = await ensureSdk()
      if (!sdk.promptUserAttestation) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      const el = await sdk.promptUserAttestation((result) => {
        const outcome = String(result.result || "")
        if (outcome === "success" || outcome === "accepted") {
          closeHost(null)
          void refresh()
        } else if (isExpressSetupDismissed(outcome)) {
          closeHost(EXPRESS_DEPOSITS_COPY.setupDismissed)
        }
      })
      setSlot(el)
      return true
    })

  const startL2 = () => {
    setOpeningIdentity(true)
    void run(async () => {
      const client = await ensureSdk()
      const authed = await ensureLinkSession(client)
      if (!authed) {
        closeHost(EXPRESS_DEPOSITS_COPY.setupDismissed)
        return true
      }
      const verify = client.verifyDocuments || client.verifyIdentity
      if (!verify) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      let settled = false
      const finish = (raw: unknown) => {
        if (settled) return
        settled = true
        const outcome = expressIdentityOutcome(raw)
        setOpeningIdentity(false)
        if (isExpressIdentitySuccess(outcome) || isExpressKycAlreadyVerified(outcome)) {
          closeHost(null)
          void pollUntilNotReview()
          return
        }
        closeHost(EXPRESS_DEPOSITS_COPY.setupDismissed)
      }
      const pending = verify(finish)
      void Promise.resolve(pending).then((first) => {
        if (first instanceof HTMLElement) {
          setSlot(first)
          return
        }
        if (first !== undefined) finish(first)
      })
      return true
    })
  }

  useEffect(() => {
    if (step !== "us_l2" && step !== "eu_l2") {
      l2StartedRef.current = false
      return
    }
    if (l2StartedRef.current) return
    l2StartedRef.current = true
    setOpeningIdentity(true)
    startL2()
  }, [step])

  useEffect(() => {
    if (isExpressReviewSetupStep(step) || step === "wallet" || step === "ready") {
      setOpeningIdentity(false)
    }
    if (!isExpressReviewSetupStep(step) && step !== "us_l2" && step !== "eu_l2") return
    if (!isExpressReviewSetupStep(step) && !openingIdentity && !l2StartedRef.current) return
    const id = window.setInterval(() => {
      void refresh()
    }, 2500)
    return () => window.clearInterval(id)
  }, [step, openingIdentity, refresh])

  const registerWallet = () =>
    void run(async () => {
      const client = await ensureSdk()
      const res = await fetchWithSession("/api/stripe/onramp/wallets/register", { method: "POST", headers: SCOPE })
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        code?: string
        walletAddress?: string
        registered?: boolean
      }
      if (!res.ok) throw new Error(mapStripeOnrampError(j.code, j.error))
      if (j.registered) return
      const walletAddress = String(j.walletAddress || "").trim()
      if (!walletAddress || !client.registerWalletAddress) {
        throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      }
      const authed = await ensureLinkSession(client)
      if (!authed) {
        closeHost(EXPRESS_DEPOSITS_COPY.setupDismissed)
        return true
      }
      await client.registerWalletAddress(walletAddress, "solana")
    })

  const field = (key: string, label: string, type = "text") => (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input
        type={type}
        value={form[key] || ""}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
      />
    </label>
  )

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold">{EXPRESS_DEPOSITS_COPY.title}</h1>
      </div>

      {step === "link" && !slot ? (
        <div className="space-y-3">
          {field("email", "Email", "email")}
          {field("phone", "Phone")}
          {field("given_name", "First name")}
          {field("surname", "Last name")}
          <Button disabled={busy} onClick={startLink}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {EXPRESS_DEPOSITS_COPY.setupCta}
          </Button>
        </div>
      ) : null}

      {(step === "us_kyc" || step === "eu_kyc") && status && !slot ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.kycHint}</p>
          {field("given_name", "First name")}
          {field("surname", "Last name")}
          {field("line1", "Address")}
          {field("city", "City")}
          {step === "us_kyc" || form.country === "IE" ? field("state", "State / county") : null}
          {field("postal_code", "Postal code")}
          {field("dob_day", "Birth day")}
          {field("dob_month", "Birth month")}
          {field("dob_year", "Birth year")}
          {step === "us_kyc" ? (
            <>
              {field("ssn", EXPRESS_DEPOSITS_COPY.ssnLabel, "password")}
              <p className="text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.ssnHint}</p>
            </>
          ) : null}
          {step === "eu_kyc" ? (
            <>
              {field("nationalities", EXPRESS_DEPOSITS_COPY.nationalitiesLabel)}
              {field("birth_city", EXPRESS_DEPOSITS_COPY.birthCityLabel)}
              {field("birth_country", EXPRESS_DEPOSITS_COPY.birthCountryLabel)}
            </>
          ) : null}
          <Button disabled={busy} onClick={submitKyc}>
            {EXPRESS_DEPOSITS_COPY.continueCta}
          </Button>
        </div>
      ) : null}

      {step === "eu_identifiers" && !slot ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.identifierHint}</p>
          {field("identifier", "ID number")}
          <Button disabled={busy} onClick={submitIdentifiers}>
            {EXPRESS_DEPOSITS_COPY.continueCta}
          </Button>
        </div>
      ) : null}

      {step === "eu_attestation" && !slot ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">{EXPRESS_DEPOSITS_COPY.acceptTermsTitle}</p>
          <p className="text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.acceptTermsHint}</p>
          <Button disabled={busy} onClick={startAttestation}>
            {EXPRESS_DEPOSITS_COPY.continueCta}
          </Button>
        </div>
      ) : null}

      {isExpressReviewSetupStep(step) && !slot ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.reviewHint}</p>
          <Button disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {EXPRESS_DEPOSITS_COPY.openingCta}
          </Button>
        </div>
      ) : null}

      {(step === "us_l2" || step === "eu_l2") && !slot ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">{EXPRESS_DEPOSITS_COPY.identityTitle}</p>
          <p className="text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.identityHint}</p>
          <Button disabled={busy || openingIdentity} onClick={startL2}>
            {openingIdentity ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {openingIdentity ? EXPRESS_DEPOSITS_COPY.openingCta : EXPRESS_DEPOSITS_COPY.verifyCta}
          </Button>
        </div>
      ) : null}

      {step === "wallet" && !slot ? (
        <Button disabled={busy} onClick={registerWallet}>
          {EXPRESS_DEPOSITS_COPY.finishSetupCta}
        </Button>
      ) : null}

      {(step === "ready" || status?.ready) && !slot ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.readyBadge}</p>
          <Button
            onClick={() => {
              onClose()
              router.push("/accounts")
            }}
          >
            Add money
          </Button>
        </div>
      ) : null}

      <ExpressDepositsStripeSlot element={slot} />
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <Button variant="ghost" onClick={onClose}>
        Back
      </Button>
    </div>
  )
}

export function ExpressDepositsSetupFromUrl() {
  const params = useSearchParams()
  const router = useRouter()
  if (params.get("flow") !== "express") return null
  return (
    <ExpressDepositsSetup
      onClose={() => {
        const next = new URLSearchParams(params.toString())
        next.delete("flow")
        router.replace(`/settings?${next.toString()}`)
      }}
    />
  )
}
