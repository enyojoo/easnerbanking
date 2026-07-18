"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { YcMomoPhoneInput } from "@/components/yc-momo-phone-input"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import {
  persistSendFlowState,
  SEND_FLOW_STATE_KEY,
  type SendFlowState,
} from "@/lib/send-flow-session"
import { residenceCountryFromPayInCurrency } from "@/hooks/use-yc-cross-border-flow"
import {
  prefetchYcPayInNetworks,
  readCachedYcPayInNetworks,
} from "@/lib/yc-local-deposit-cache"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { normalizeYcMomoPhone, REVIEW_ROW_LABELS } from "@easner/shared"
import {
  crossBorderQuoteToFlowState,
  ensureCrossBorderOrderConfirmed,
  isCompleteCrossBorderQuote,
  peekLastCrossBorderQuoteError,
  type CrossBorderQuoteStashMeta,
} from "@/lib/yc-cross-border-quote-cache"

function isYcCrossBorderMomo(state: SendFlowState | null): boolean {
  return (
    state?.paymentMethod === "otherCurrency" &&
    state.otherPaymentMethod === "mobile_money" &&
    Boolean(state.otherCurrency)
  )
}

export default function SendMomoSetupPage() {
  const router = useRouter()
  const { tier1Complete, isLoading: profileLoading } = useBusinessProfile()
  const [state, setState] = useState<SendFlowState | null>(null)
  const [momoPhone, setMomoPhone] = useState("")
  const [momoNetworkId, setMomoNetworkId] = useState("")
  const [momoNetworks, setMomoNetworks] = useState<{ id: string; name: string }[]>([])
  const [momoNetworksLoading, setMomoNetworksLoading] = useState(false)
  const [isContinueLoading, setIsContinueLoading] = useState(false)
  const [continueError, setContinueError] = useState<string | null>(null)

  const payInCurrency = state?.otherCurrency?.trim().toUpperCase() ?? ""
  const payInCountry = payInCurrency ? residenceCountryFromPayInCurrency(payInCurrency) : null
  const momoReady = Boolean(momoPhone.trim() && momoNetworkId)
  const selectedNetwork = momoNetworks.find((n) => n.id === momoNetworkId)

  useEffect(() => {
    const raw = sessionStorage.getItem(SEND_FLOW_STATE_KEY)
    if (!raw) {
      router.replace("/send")
      return
    }
    try {
      const parsed = JSON.parse(raw) as SendFlowState
      if (!isYcCrossBorderMomo(parsed) || !(parsed.amount > 0)) {
        router.replace("/send")
        return
      }
      setState({
        ...parsed,
        recipient: coerceBeneficiaryEasenetDisplay(parsed.recipient),
      })
      const setup = parsed.ycMomoSetup
      if (setup?.sourcePhone) setMomoPhone(setup.sourcePhone)
      if (setup?.networkId) setMomoNetworkId(setup.networkId)
    } catch {
      router.replace("/send")
    }
  }, [router])

  useEffect(() => {
    if (profileLoading) return
    if (state && !tier1Complete) {
      router.replace("/send")
    }
  }, [profileLoading, tier1Complete, state, router])

  useEffect(() => {
    if (!state || !payInCountry || !payInCurrency) return
    let cancelled = false
    const cached = readCachedYcPayInNetworks(payInCountry, payInCurrency)
    if (cached?.length) {
      setMomoNetworks(cached)
      if (cached.length === 1 && !momoNetworkId) setMomoNetworkId(cached[0].id)
    } else {
      setMomoNetworksLoading(true)
    }
    void (async () => {
      try {
        const rows = await prefetchYcPayInNetworks(payInCountry, payInCurrency)
        if (!cancelled) {
          setMomoNetworks(rows)
          if (rows.length === 1 && !momoNetworkId) setMomoNetworkId(rows[0].id)
        }
      } finally {
        if (!cancelled) setMomoNetworksLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state, payInCountry, payInCurrency])

  useEffect(() => {
    if (!state || !payInCountry) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchWithSession("/api/settings/personal")
        const data = (await res.json().catch(() => ({}))) as { personal?: { phone?: string | null } }
        if (!cancelled && res.ok) {
          const phone = String(data.personal?.phone ?? "").trim()
          setMomoPhone((prev) =>
            prev || (phone ? normalizeYcMomoPhone(phone, payInCountry) : ""),
          )
        }
      } catch {
        // optional prefill
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state, payInCountry])

  const onContinue = async () => {
    if (!state || !momoReady || !payInCountry || !payInCurrency || isContinueLoading) return
    setContinueError(null)
    setIsContinueLoading(true)
    try {
      const meta: CrossBorderQuoteStashMeta = {
        recipientId: state.recipient.id,
        payInCurrency,
        payInCountry,
        payInRail: "mobile_money",
        receiveAmount: state.amount,
        sourcePhone: momoPhone.trim(),
        networkId: momoNetworkId,
        sourceNetworkName: selectedNetwork?.name,
      }
      const quote = await ensureCrossBorderOrderConfirmed(meta)
      if (!isCompleteCrossBorderQuote(quote)) {
        setContinueError(peekLastCrossBorderQuoteError() || "Could not lock transfer details. Try again.")
        return
      }
      const yc = crossBorderQuoteToFlowState(quote, meta)
      const next: SendFlowState = {
        ...state,
        ycMomoSetup: {
          sourcePhone: momoPhone.trim(),
          networkId: momoNetworkId,
          sourceNetworkName: selectedNetwork?.name,
        },
        sendAmount: yc.localPayIn,
        sendCurrency: payInCurrency,
        totalAmount: yc.localPayIn,
        transactionId: yc.easnerTransactionId || yc.transactionId || state.transactionId,
        ycCrossBorder: yc,
      }
      persistSendFlowState(next)
      router.push("/send/confirm")
    } finally {
      setIsContinueLoading(false)
    }
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-2xl animate-pulse space-y-4 py-6">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-32 rounded bg-muted" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Mobile money</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the number and network you&apos;ll pay from
        </p>
      </div>

      <div className="rounded-xl border border-border p-4 space-y-3 text-sm">
        <div>
          <Label htmlFor="send-momo-phone">{REVIEW_ROW_LABELS.momoNumberPrompt}</Label>
          {payInCountry ? (
            <YcMomoPhoneInput
              id="send-momo-phone"
              countryCode={payInCountry}
              value={momoPhone}
              onChange={setMomoPhone}
              className="mt-1"
              placeholder="712345678"
            />
          ) : null}
        </div>
        <div>
          <Label>{REVIEW_ROW_LABELS.momoNetworkPrompt}</Label>
          {momoNetworksLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col gap-2 mt-2">
              {momoNetworks.map((network) => (
                <button
                  key={network.id}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    momoNetworkId === network.id ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  onClick={() => setMomoNetworkId(network.id)}
                >
                  {network.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {continueError ? (
        <p className="text-sm text-destructive" role="alert">
          {continueError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="h-11" onClick={() => router.back()} disabled={isContinueLoading}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          size="lg"
          className="h-11 flex-1"
          disabled={!momoReady || isContinueLoading}
          onClick={() => void onContinue()}
        >
          {isContinueLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Locking…
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    </div>
  )
}
