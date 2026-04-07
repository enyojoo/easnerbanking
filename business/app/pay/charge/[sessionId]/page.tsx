"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { toast } from "sonner"
import { CheckCircle2, Copy, ExternalLink, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type SessionRow = {
  id: string
  status: string
  destination_address: string | null
  crypto_currency: string
  network: string
  fiat_amount: string | number
  fiat_currency: string
  crypto_amount_expected: string | null
  expires_at: string | null
}

const STATUS_LABEL: Record<string, string> = {
  creating_workflow: "Preparing…",
  awaiting_deposit: "Awaiting payment",
  deposit_detected: "Deposit seen — settlement in progress",
  payout_pending: "Payout processing",
  payout_complete: "Paid",
  failed: "Failed",
  expired: "Expired",
}

function isTerminalStatus(status: string): boolean {
  return status === "payout_complete" || status === "failed" || status === "expired"
}

function formatCountdown(expiresAtIso: string | null, now: number): string | null {
  if (!expiresAtIso) return null
  const end = new Date(expiresAtIso).getTime()
  if (!Number.isFinite(end)) return null
  const ms = end - now
  if (ms <= 0) return "Expired"
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const mm = m % 60
    return `${h}h ${mm}m`
  }
  return `${m}:${s.toString().padStart(2, "0")}`
}

function useChargeQrSize() {
  const [size, setSize] = useState(200)
  useEffect(() => {
    const compute = () => {
      const w = typeof window !== "undefined" ? window.innerWidth : 400
      const next = Math.min(280, Math.max(168, Math.floor(Math.min(w, 900) * 0.62)))
      setSize(next)
    }
    compute()
    window.addEventListener("resize", compute)
    return () => window.removeEventListener("resize", compute)
  }, [])
  return size
}

export default function PayChargePage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = String(params.sessionId || "")
  const qrSize = useChargeQrSize()

  const [session, setSession] = useState<SessionRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const tick = async (): Promise<boolean> => {
      const res = await fetchWithSession(`/api/terminal/sessions/${encodeURIComponent(sessionId)}`)
      const body = (await res.json().catch(() => ({}))) as { session?: SessionRow; error?: string }
      if (cancelled) return true
      if (!res.ok) {
        toast.error(body.error || "Could not load session.")
        setLoading(false)
        return true
      }
      const s = body.session ?? null
      setSession(s)
      setLoading(false)
      return s ? isTerminalStatus(s.status) : true
    }

    void (async () => {
      const stop = await tick()
      if (cancelled || stop) return
      intervalId = setInterval(() => {
        void (async () => {
          const done = await tick()
          if (done && intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        })()
      }, 2500)
    })()

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [sessionId])

  const dest = session?.destination_address?.trim() || ""
  const label = session ? STATUS_LABEL[session.status] || session.status : ""
  const countdown = session ? formatCountdown(session.expires_at, nowTick) : null
  const cryptoExpected = session?.crypto_amount_expected?.trim() || ""

  const copyAddr = async () => {
    if (!dest) return
    try {
      await navigator.clipboard.writeText(dest)
      toast.success("Address copied")
    } catch {
      toast.error("Could not copy")
    }
  }

  if (!sessionId) {
    return <p className="text-sm text-muted-foreground">Invalid session.</p>
  }

  if (loading && !session) {
    return <p className="text-sm text-muted-foreground">Loading payment…</p>
  }

  if (!session) {
    return <p className="text-sm text-muted-foreground">Session not found.</p>
  }

  const isPaid = session.status === "payout_complete"
  const isFailed = session.status === "failed"
  const isExpired = session.status === "expired" || countdown === "Expired"

  return (
    <div className="flex w-full flex-col items-stretch gap-5 text-center sm:gap-6">
      <div className="px-0 sm:px-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Pay with stablecoin</h1>
        {isPaid ? (
          <p className="mt-2 text-sm text-muted-foreground">This charge is complete.</p>
        ) : isFailed ? (
          <p className="mt-2 text-sm text-destructive">This charge could not be completed. Start a new payment.</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Send at least the crypto amount below on <span className="font-medium">{session.network}</span>. Sending
            more may still settle depending on your wallet and network fees.
          </p>
        )}
      </div>

      {isPaid ? (
        <div
          className="mx-auto flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-6"
          role="status"
        >
          <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <p className="text-lg font-semibold text-foreground">Payment received</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      ) : null}

      {isFailed ? (
        <div
          className="mx-auto flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-5"
          role="alert"
        >
          <XCircle className="h-10 w-10 text-destructive" aria-hidden />
          <p className="text-sm font-medium text-foreground">Charge failed</p>
        </div>
      ) : null}

      {!isPaid ? (
        <>
          <p
            className={cn(
              "text-xs font-medium uppercase tracking-wide",
              isFailed || isExpired ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {label}
          </p>
          {countdown && !isFailed && session.status !== "payout_complete" ? (
            <p className="text-xs text-muted-foreground">
              {countdown === "Expired"
                ? "This payment window may have expired. If payment already went through, status will update when Noah confirms."
                : `Time remaining to use this address: ${countdown}`}
            </p>
          ) : null}
        </>
      ) : null}

      {!isPaid ? (
        <div className="mx-auto w-full max-w-[min(100%,320px)] rounded-xl border bg-card p-3 shadow-sm sm:p-4">
          {dest ? (
            <QRCodeSVG value={dest} size={qrSize} includeMargin className="mx-auto h-auto max-w-full" />
          ) : (
            <div
              className="mx-auto flex items-center justify-center text-sm text-muted-foreground"
              style={{ minHeight: qrSize, width: "100%", maxWidth: qrSize }}
            >
              No deposit address yet
            </div>
          )}
        </div>
      ) : null}

      <div className="w-full space-y-2 rounded-xl border bg-muted/30 px-4 py-3 text-left text-sm sm:px-5">
        <div className="flex justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Invoice total</span>
          <span className="min-w-0 text-right font-mono font-medium tabular-nums">
            {String(session.fiat_amount)} {session.fiat_currency}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Min. crypto (quote)</span>
          <span className="min-w-0 text-right font-mono font-medium tabular-nums">
            {cryptoExpected ? `${cryptoExpected} ${session.crypto_currency}` : "—"}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Network</span>
          <span className="min-w-0 truncate text-right font-mono text-xs">{session.network}</span>
        </div>
      </div>

      {dest && !isPaid ? (
        <div className="w-full space-y-3">
          <p className="break-all rounded-lg bg-muted/50 p-3 text-left font-mono text-[11px] leading-relaxed sm:text-xs">
            {dest}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="h-12 w-full touch-manipulation gap-2"
            onClick={() => void copyAddr()}
          >
            <Copy className="h-4 w-4" aria-hidden />
            Copy address
          </Button>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="h-12 w-full touch-manipulation gap-2"
        onClick={() => router.push("/pay")}
      >
        <ExternalLink className="h-4 w-4" aria-hidden />
        New payment
      </Button>
    </div>
  )
}
