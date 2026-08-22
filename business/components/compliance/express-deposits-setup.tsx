"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  EXPRESS_DEPOSITS_COPY,
  expressSetupUserMessage,
  toExpressLinkE164Phone,
  type ExpressDepositsNextStep,
} from "@easner/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { Loader2 } from "lucide-react"
import { loadExpressOnramp, type CryptoOnrampClient } from "@/lib/stripe/load-crypto-onramp"
import { ExpressDepositsStripeSlot } from "@/components/compliance/express-deposits-stripe-slot"
import { mapStripeOnrampError } from "@/lib/stripe/onramp-sdk-map"

const SCOPE = { "X-Easner-Account-Scope": "business" } as const

type Status = {
  ready?: boolean
  nextStep?: ExpressDepositsNextStep
  publishableKey?: string
  prefill?: Record<string, unknown>
  payerCountry?: string | null
  eligible?: boolean
  error?: string
}

type Props = { onClose: () => void }

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

export function ExpressDepositsSetup({ onClose }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [sdk, setSdk] = useState<CryptoOnrampClient | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetchWithSession("/api/stripe/onramp/status", { headers: SCOPE })
    const data = (await res.json().catch(() => ({}))) as Status
    if (!res.ok) {
      setMessage(data.error || EXPRESS_DEPOSITS_COPY.geoUnavailable)
      return data
    }
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
    }))
    if (data.publishableKey && !sdk) {
      const client = await loadExpressOnramp(data.publishableKey)
      setSdk(client)
    }
    return data
  }, [sdk])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const persistLink = async (cryptoCustomerId: string, accessToken?: string) => {
    await fetchWithSession("/api/stripe/onramp/link-complete", {
      method: "POST",
      headers: { ...SCOPE, "Content-Type": "application/json" },
      body: JSON.stringify({ cryptoCustomerId, accessToken }),
    })
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setMessage(expressSetupUserMessage(e instanceof Error ? e.message : null))
    } finally {
      setBusy(false)
    }
  }

  const step = status?.nextStep ?? "link"

  const startLink = () =>
    void run(async () => {
      if (!sdk) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      const auth = await fetchWithSession("/api/stripe/onramp/link-auth", {
        method: "POST",
        headers: { ...SCOPE, "Content-Type": "application/json" },
        body: "{}",
      })
      const authJson = (await auth.json().catch(() => ({}))) as {
        authIntentId?: string
        needsRegister?: boolean
        error?: string
      }
      if (authJson.needsRegister || !authJson.authIntentId) {
        const country = status?.payerCountry || form.country
        await sdk.registerLinkUser(
          form.email.trim(),
          toExpressLinkE164Phone(form.phone, country),
          country,
          `${form.given_name} ${form.surname}`.trim(),
        )
        const again = await fetchWithSession("/api/stripe/onramp/link-auth", {
          method: "POST",
          headers: { ...SCOPE, "Content-Type": "application/json" },
          body: "{}",
        })
        const againJson = (await again.json().catch(() => ({}))) as { authIntentId?: string }
        if (!againJson.authIntentId) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
        const el = await sdk.authenticate(againJson.authIntentId, async (result) => {
          if (result.result === "success" && result.crypto_customer_id) {
            await persistLink(result.crypto_customer_id, result.access_token || result.oauth_token)
            setSlot(null)
            await refresh()
          }
        })
        setSlot(el)
        return
      }
      const el = await sdk.authenticate(authJson.authIntentId, async (result) => {
        if (result.result === "success" && result.crypto_customer_id) {
          await persistLink(result.crypto_customer_id, result.access_token || result.oauth_token)
          setSlot(null)
          await refresh()
        }
      })
      setSlot(el)
    })

  const submitKyc = () =>
    void run(async () => {
      if (!sdk) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      const payload: Record<string, unknown> = {
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
          state: form.state || undefined,
          postal_code: form.postal_code,
          country: status?.payerCountry || form.country,
        },
      }
      if (step.startsWith("eu")) {
        payload.nationalities = form.nationalities.split(/[\s,]+/).filter(Boolean)
        payload.birth_city = form.birth_city
        payload.birth_country = form.birth_country
      }
      await sdk.submitKycInfo(payload)
    })

  const submitIdentifiers = () =>
    void run(async () => {
      if (!sdk?.getMissingIdentifiers || !sdk.updateKycInfo) {
        throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      }
      const missing = await sdk.getMissingIdentifiers()
      const type = missing.identifiers?.[0]?.type
      await sdk.updateKycInfo({
        identifiers: type ? [{ type, value: form.identifier }] : [],
      })
    })

  const startAttestation = () =>
    void run(async () => {
      if (!sdk?.promptUserAttestation) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      const el = await sdk.promptUserAttestation((result) => {
        if (result.result === "success" || result.result === "accepted") {
          setSlot(null)
          void refresh()
        }
      })
      setSlot(el)
    })

  const startL2 = () =>
    void run(async () => {
      if (!sdk) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      const verify = sdk.verifyDocuments || sdk.verifyIdentity
      if (!verify) throw new Error(EXPRESS_DEPOSITS_COPY.somethingWentWrong)
      const el = await verify(() => {
        setSlot(null)
        void refresh()
      })
      setSlot(el)
    })

  const registerWallet = () =>
    void run(async () => {
      const res = await fetchWithSession("/api/stripe/onramp/wallets/register", { method: "POST", headers: SCOPE })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
        throw new Error(mapStripeOnrampError(j.code, j.error))
      }
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
        {!slot ? (
          <p className="mt-2 text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.description}</p>
        ) : null}
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

      {(step === "us_kyc" || step === "eu_kyc") && status ? (
        <div className="space-y-3">
          {field("given_name", "First name")}
          {field("surname", "Last name")}
          {field("line1", "Address")}
          {field("city", "City")}
          {step === "us_kyc" || form.country === "IE" ? field("state", "State / county") : null}
          {field("postal_code", "Postal code")}
          {field("dob_day", "Birth day")}
          {field("dob_month", "Birth month")}
          {field("dob_year", "Birth year")}
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

      {step === "eu_identifiers" ? (
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

      {(step === "us_l2" || step === "eu_l2") && !slot ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">{EXPRESS_DEPOSITS_COPY.identityTitle}</p>
          <p className="text-sm text-muted-foreground">{EXPRESS_DEPOSITS_COPY.identityHint}</p>
          <Button disabled={busy} onClick={startL2}>
            {EXPRESS_DEPOSITS_COPY.verifyCta}
          </Button>
        </div>
      ) : null}

      {step === "wallet" ? (
        <Button disabled={busy} onClick={registerWallet}>
          Finish setup
        </Button>
      ) : null}

      {step === "ready" || status?.ready ? (
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
