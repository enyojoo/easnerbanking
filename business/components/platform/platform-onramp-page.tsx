"use client"

import { useEffect, useState } from "react"
import { apiUrl } from "@/lib/api-base-url"

type Session = {
  id: string
  amount: number
  currency: string
  status: string
  livemode: boolean
  return_url: string | null
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount / 100)
}

export function PlatformOnrampPage({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(apiUrl(`/api/platform/onramp-sessions/${encodeURIComponent(sessionId)}`), {
        credentials: "omit",
      })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as Session & { error?: string }
        if (!res.ok) throw new Error(json.error || "Session not found")
        if (!cancelled) setSession(json)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Session not found")
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const complete = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/api/platform/onramp-sessions/${encodeURIComponent(sessionId)}/complete`), {
        method: "POST",
        credentials: "omit",
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; return_url?: string | null; status?: string }
      if (!res.ok) throw new Error(json.error || "Could not complete")
      if (json.return_url) {
        window.location.href = json.return_url
        return
      }
      setSession((prev) => (prev ? { ...prev, status: json.status || "completed" } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-xl font-semibold text-foreground">Add money</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!session && !error ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {session ? (
        <>
          <p className="text-sm text-muted-foreground">
            {money(session.amount, session.currency)} onto your account.
          </p>
          {session.status === "completed" ? (
            <p className="text-sm text-foreground">This deposit is complete.</p>
          ) : session.livemode ? (
            <p className="text-sm text-muted-foreground">
              Finish this deposit in your app. Live card onramp opens here when the session is ready.
            </p>
          ) : (
            <button
              type="button"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              disabled={busy}
              onClick={() => void complete()}
            >
              {busy ? "Completing…" : "Complete test deposit"}
            </button>
          )}
        </>
      ) : null}
    </div>
  )
}
