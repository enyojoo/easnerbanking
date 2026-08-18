"use client"

import { useCallback, useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import { Copy, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CustomerPayHeader } from "@/components/pay/customer-pay-shell"
import { StablecoinChargePanel } from "@/components/pay/stablecoin-charge-panel"
import {
  EasnerPaymentElementCheckout,
  PaymentFormSkeleton,
  PaymentReceivedNotice,
} from "@/components/checkout/easner-payment-element-checkout"
import type { PublicPaymentLinkPayload } from "@/lib/payment-links/public-payload"
import { recurringDisclosure } from "@/lib/payment-links/types"
import { formatCurrency } from "@/lib/utils"

type Resolution =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "payment_link"; payload: PublicPaymentLinkPayload }
  | { kind: "stablecoin_session"; sessionId: string }

export function PaymentLinkPayPanel({ slugParts }: { slugParts: string[] }) {
  const [resolution, setResolution] = useState<Resolution>({ kind: "loading" })

  const path = slugParts.map((part) => encodeURIComponent(part)).join("/")

  useEffect(() => {
    if (!path) {
      setResolution({ kind: "not_found" })
      return
    }
    let cancelled = false

    void (async () => {
      try {
        const res = await fetch(`/api/payment-links/public/${path}`)
        const body = (await res.json().catch(() => ({}))) as
          | PublicPaymentLinkPayload
          | { kind: "stablecoin_session"; sessionId: string }
          | { error?: string }
        if (cancelled) return
        if (!res.ok || !("kind" in body)) {
          setResolution({ kind: "not_found" })
          return
        }
        setResolution(
          body.kind === "stablecoin_session"
            ? { kind: "stablecoin_session", sessionId: body.sessionId }
            : { kind: "payment_link", payload: body },
        )
      } catch {
        if (!cancelled) setResolution({ kind: "not_found" })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [path])

  if (resolution.kind === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-16" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  if (resolution.kind === "not_found") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-lg font-semibold text-foreground">This payment link is unavailable</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          The link may have been closed or the address mistyped. Ask the business for a new link.
        </p>
      </div>
    )
  }

  if (resolution.kind === "stablecoin_session") {
    return <StablecoinChargePanel sessionId={resolution.sessionId} variant="customer" />
  }

  return <PaymentLinkSurface payload={resolution.payload} path={path} />
}

function PaymentLinkSurface({
  payload,
  path,
}: {
  payload: PublicPaymentLinkPayload
  path: string
}) {
  const { link, business } = payload
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(link.rail === "card_bank" && payload.onlinePaymentsEnabled)
  const [paid, setPaid] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const listedAmount = formatCurrency(link.amountCents / 100, link.currency)
  const customerAmount = formatCurrency(payload.customerAmountCents / 100, link.currency)

  useEffect(() => {
    if (link.rail !== "card_bank" || !payload.onlinePaymentsEnabled || paid) return
    let cancelled = false

    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/payment-links/public/${path}`, { method: "POST" })
        const body = (await res.json().catch(() => ({}))) as {
          clientSecret?: string
          error?: string
        }
        if (cancelled) return
        if (!res.ok || !body.clientSecret) {
          throw new Error(body.error || "Could not start this payment")
        }
        setClientSecret(body.clientSecret)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not start this payment")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [link.rail, payload.onlinePaymentsEnabled, paid, path, attempt])

  const onPaid = useCallback(() => {
    setPaid(true)
    if (link.redirectUrl) {
      window.location.assign(link.redirectUrl)
    }
  }, [link.redirectUrl])

  return (
    <div className="flex flex-1 flex-col">
      <CustomerPayHeader
        businessName={business.name}
        logoUrl={business.logoUrl}
        title={link.label}
      />

      <div className="mb-6 rounded-xl border bg-muted/30 px-4 py-4 text-left sm:px-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{customerAmount}</p>
        {payload.surchargeCents > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {listedAmount} plus a{" "}
            {formatCurrency(payload.surchargeCents / 100, link.currency)} processing fee
          </p>
        ) : null}
        {link.mode === "subscription" ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Billed every {link.billingInterval === "year" ? "year" : "month"}
          </p>
        ) : null}
        {link.description ? (
          <p className="mt-3 text-sm text-muted-foreground">{link.description}</p>
        ) : null}
      </div>

      {link.rail === "stablecoin" ? (
        <StablecoinDepositPanel payload={payload} />
      ) : paid ? (
        <PaymentReceivedNotice
          message={
            link.mode === "subscription"
              ? `Your subscription with ${business.name} is active. A receipt is on its way.`
              : `Thank you. ${business.name} has been notified of your payment.`
          }
        />
      ) : !payload.onlinePaymentsEnabled ? (
        <p className="text-sm text-muted-foreground">
          {business.name} is not accepting card or bank payments yet. Please contact them for
          another way to pay.
        </p>
      ) : loading && !clientSecret ? (
        <PaymentFormSkeleton />
      ) : error || !clientSecret ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive" role="alert">
            {error || "Unable to load the payment form"}
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setClientSecret(null)
              setAttempt((a) => a + 1)
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <EasnerPaymentElementCheckout
          clientSecret={clientSecret}
          amount={payload.customerAmountCents / 100}
          currency={link.currency}
          successMessage={`Thank you. ${business.name} has been notified of your payment.`}
          disclosure={
            link.mode === "subscription"
              ? recurringDisclosure(link, customerAmount)
              : undefined
          }
          onPaid={onPaid}
        />
      )}
    </div>
  )
}

function StablecoinDepositPanel({ payload }: { payload: PublicPaymentLinkPayload }) {
  const deposit = payload.stablecoin
  const address = deposit?.depositAddress?.trim() || ""

  if (!address) {
    return (
      <p className="text-sm text-muted-foreground">
        This stablecoin link is still being set up. Check back shortly or ask the business for
        another way to pay.
      </p>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      toast.success("Address copied")
    } catch {
      toast.error("Could not copy")
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-4 text-center">
      <p className="text-sm text-muted-foreground">
        Send {deposit?.cryptoCurrency} on{" "}
        <span className="font-medium">{deposit?.network}</span> to the address below. The business is
        credited once the deposit confirms.
      </p>
      <div className="mx-auto w-full max-w-[min(100%,320px)] rounded-xl border bg-card p-3 shadow-sm sm:p-4">
        <QRCodeSVG value={address} size={220} includeMargin className="mx-auto h-auto max-w-full" />
      </div>
      <p className="break-all rounded-lg bg-muted/50 p-3 text-left font-mono text-[11px] leading-relaxed sm:text-xs">
        {address}
      </p>
      {deposit?.depositMemo ? (
        <p className="text-xs text-muted-foreground">
          Include memo <span className="font-mono">{deposit.depositMemo}</span>
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="h-12 w-full touch-manipulation gap-2"
        onClick={() => void copy()}
      >
        <Copy className="h-4 w-4" aria-hidden />
        Copy address
      </Button>
    </div>
  )
}
