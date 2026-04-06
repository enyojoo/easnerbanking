"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { TERMINAL_ALLOWED_PAIRS, type TerminalAllowedPair } from "@/lib/terminal-allowed-pairs"
import { useAuth } from "@/lib/auth-context"
import { resolveTerminalPayFiatCurrency } from "@/lib/noah/terminal-pay-fiat"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export default function PayAssetPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { tier1Complete, baseCurrency } = useBusinessProfile()
  /** Counter charge label only; API derives the same from org `base_currency`. Payout currency = Setup payout recipient. */
  const chargeFiatCurrency = resolveTerminalPayFiatCurrency(baseCurrency)
  const amountStr = searchParams.get("amount") || ""
  const fiatAmount = Number.parseFloat(amountStr)

  const [selected, setSelected] = useState<TerminalAllowedPair | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const pairs = useMemo(() => TERMINAL_ALLOWED_PAIRS, [])

  const onCreateSession = async () => {
    if (!tier1Complete || !selected) return
    if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
      toast.error("Invalid amount. Go back and enter a valid total.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetchWithSession("/api/terminal/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Easner-Noah-Scope": "business",
        },
        body: JSON.stringify({
          fiat_amount: fiatAmount,
          crypto_currency: selected.cryptoCurrency,
          network: selected.network,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        session_id?: string
      }
      if (!res.ok) {
        toast.error(data.error || "Could not create payment.")
        return
      }
      if (!data.session_id) {
        toast.error("No session returned.")
        return
      }
      if (user?.id) {
        dataCache.invalidate(CACHE_KEYS.TERMINAL_SESSIONS(user.id))
      }
      router.push(`/pay/charge/${data.session_id}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
    return (
      <div className="flex w-full flex-col gap-4">
        <p className="text-sm text-muted-foreground">Missing amount. Start from the counter home.</p>
        <Button type="button" variant="secondary" className="touch-manipulation" onClick={() => router.push("/pay")}>
          Back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Stablecoin Auto Payout</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Stablecoin &amp; network</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer pays {fiatAmount.toFixed(2)} {chargeFiatCurrency} in:
        </p>
      </div>
      <ul className="flex flex-col gap-2 sm:gap-3">
        {pairs.map((p) => {
          const isActive =
            selected?.cryptoCurrency === p.cryptoCurrency && selected?.network === p.network
          return (
            <li key={`${p.cryptoCurrency}-${p.network}`}>
              <button
                type="button"
                disabled={!tier1Complete}
                onClick={() => setSelected(p)}
                className={cn(
                  "flex w-full touch-manipulation items-center rounded-xl border px-4 py-3.5 text-left text-sm transition sm:py-4",
                  isActive
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:bg-muted/50",
                )}
              >
                {p.label}
              </button>
            </li>
          )
        })}
      </ul>
      <Button
        type="button"
        className="h-12 w-full touch-manipulation"
        disabled={!tier1Complete || !selected || submitting}
        onClick={() => void onCreateSession()}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Creating…
          </>
        ) : (
          "Show payment QR"
        )}
      </Button>
    </div>
  )
}
