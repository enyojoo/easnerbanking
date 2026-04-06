"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { toast } from "sonner"
import { Copy, ExternalLink } from "lucide-react"

type SessionRow = {
  id: string
  status: string
  destination_address: string | null
  crypto_currency: string
  network: string
  fiat_amount: string | number
  fiat_currency: string
  expires_at: string | null
}

const STATUS_LABEL: Record<string, string> = {
  creating_workflow: "Preparing…",
  awaiting_deposit: "Awaiting payment",
  deposit_detected: "Deposit seen",
  payout_pending: "Payout processing",
  payout_complete: "Paid",
  failed: "Failed",
  expired: "Expired",
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

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const tick = async () => {
      const res = await fetchWithSession(`/api/terminal/sessions/${encodeURIComponent(sessionId)}`)
      const body = (await res.json().catch(() => ({}))) as { session?: SessionRow; error?: string }
      if (cancelled) return
      if (!res.ok) {
        toast.error(body.error || "Could not load session.")
        setLoading(false)
        return
      }
      setSession(body.session ?? null)
      setLoading(false)
    }
    void tick()
    const id = window.setInterval(() => void tick(), 8000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [sessionId])

  const dest = session?.destination_address?.trim() || ""
  const label = session ? STATUS_LABEL[session.status] || session.status : ""

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

  return (
    <div className="flex w-full flex-col items-stretch gap-5 text-center sm:gap-6">
      <div className="px-0 sm:px-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Pay with stablecoin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Send exactly what’s shown below on <span className="font-medium">{session.network}</span>.
        </p>
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
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
      <div className="w-full space-y-2 rounded-xl border bg-muted/30 px-4 py-3 text-left text-sm sm:px-5">
        <div className="flex justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Amount</span>
          <span className="min-w-0 text-right font-mono font-medium tabular-nums">
            {String(session.fiat_amount)} {session.fiat_currency}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Asset</span>
          <span className="min-w-0 truncate text-right font-mono font-medium">{session.crypto_currency}</span>
        </div>
      </div>
      {dest ? (
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
