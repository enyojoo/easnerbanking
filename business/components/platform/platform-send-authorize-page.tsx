"use client"

import { useEffect, useState } from "react"
import { formatMoneyDisplay } from "@easner/shared"
import { apiUrl } from "@/lib/api-base-url"

type Review = {
  id: string
  amount: number
  currency: string
  status: string
  livemode: boolean
  expires_at?: string | null
  destination_summary?: { type: string; label: string } | null
}

function money(amount: number, currency: string) {
  return formatMoneyDisplay(amount / 100, currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function PlatformSendAuthorizePage({
  transferId,
  clientSecret,
}: {
  transferId: string
  clientSecret: string
}) {
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!clientSecret) {
      setError("This send link is missing the authorization secret.")
      return
    }
    let cancelled = false
    const qs = new URLSearchParams({ client_secret: clientSecret })
    fetch(apiUrl(`/api/platform/transfers/${encodeURIComponent(transferId)}?${qs}`), {
      credentials: "omit",
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as Review & { error?: string }
        if (!res.ok) throw new Error(json.error || "Transfer not found")
        if (!cancelled) setReview(json)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Transfer not found")
      })
    return () => {
      cancelled = true
    }
  }, [transferId, clientSecret])

  const authorize = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/api/platform/transfers/${encodeURIComponent(transferId)}/confirm`), {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_secret: clientSecret }),
      })
      const json = (await res.json().catch(() => ({}))) as Review & { error?: string }
      if (!res.ok) throw new Error(json.error || "Could not authorize")
      setReview(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not authorize")
    } finally {
      setBusy(false)
    }
  }

  const open = review?.status === "requires_action"

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-xl font-semibold text-foreground">Review this send</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!review && !error ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {review ? (
        <>
          <p className="text-sm text-muted-foreground">
            {money(review.amount, review.currency)}
            {review.destination_summary?.label ? ` to ${review.destination_summary.label}` : ""}.
          </p>
          {review.status === "completed" ? (
            <p className="text-sm text-foreground">This send is complete.</p>
          ) : review.status === "canceled" || review.status === "failed" ? (
            <p className="text-sm text-muted-foreground">This send is no longer available.</p>
          ) : open ? (
            <button
              type="button"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              disabled={busy}
              onClick={() => void authorize()}
            >
              {busy ? "Authorizing…" : "Authorize"}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
