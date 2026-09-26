"use client"

import { useEffect, useRef, useState } from "react"
import { formatMoneyDisplay } from "@easner/shared"
import { apiUrl } from "@/lib/api-base-url"

type Session = {
  id: string
  amount: number
  currency: string
  status: string
  livemode: boolean
  return_url: string | null
  client_secret?: string | null
  publishable_key?: string | null
}

function money(amount: number, currency: string) {
  return formatMoneyDisplay(amount / 100, currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function PlatformOnrampPage({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mountRef = useRef<HTMLDivElement | null>(null)
  const mountedSecret = useRef<string | null>(null)

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
      if (json.return_url && json.status === "completed") {
        window.location.href = json.return_url
        return
      }
      setSession((prev) => (prev ? { ...prev, status: json.status || prev.status } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const secret = session?.client_secret
    const pk = session?.publishable_key
    if (!session?.livemode || session.status === "completed" || !secret || !pk || !mountRef.current) return
    if (mountedSecret.current === secret) return
    mountedSecret.current = secret
    let cancelled = false
    void (async () => {
      try {
        const mod = (await import("@stripe/crypto")) as {
          loadStripeOnramp?: (key: string) => Promise<{
            createSession: (opts: { clientSecret: string }) => {
              mount: (node: string | HTMLElement) => void
              addEventListener?: (event: string, cb: (event: { payload?: { session?: { status?: string } } }) => void) => void
            }
          }>
        }
        const load = mod.loadStripeOnramp
        if (!load) throw new Error("Card onramp is not available in this browser")
        const onramp = await load(pk)
        if (cancelled || !mountRef.current) return
        const inst = onramp.createSession({ clientSecret: secret })
        inst.mount(mountRef.current)
        inst.addEventListener?.("onramp_session_updated", (event) => {
          const status = String(event.payload?.session?.status ?? "")
          if (status.includes("fulfillment_complete") || status === "fulfilled" || status === "complete") {
            void complete()
          }
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open card onramp")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

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
            <>
              <div id="platform-onramp" ref={mountRef} className="min-h-[360px] w-full" />
              {!session.client_secret ? (
                <p className="text-sm text-muted-foreground">This card session is still opening. Refresh in a moment.</p>
              ) : null}
            </>
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
