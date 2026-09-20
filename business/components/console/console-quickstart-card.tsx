"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Circle } from "lucide-react"
import { APP_URLS } from "@easner/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { CheckoutCodeBlock, RevealOnceValue } from "@/components/checkout/checkout-code-block"
import { fetchWithSession } from "@/lib/fetch-with-session"

const DISMISS_KEY = "easner_console_quickstart_dismissed"

type QuickstartStatus = {
  hasTestKey: boolean
  hasCalledApi: boolean
  hasWebhook: boolean
}

function useQuickstartStatus() {
  return useQuery({
    queryKey: ["platform-quickstart-status"],
    queryFn: async (): Promise<QuickstartStatus> => {
      const res = await fetchWithSession("/api/platform/quickstart-status")
      const body = (await res.json().catch(() => ({}))) as QuickstartStatus & { error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load quickstart status")
      return body
    },
  })
}

function ChecklistItem({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className={done ? "text-muted-foreground line-through" : "text-foreground"}>{children}</span>
    </li>
  )
}

export function ConsoleQuickstartCard() {
  const queryClient = useQueryClient()
  const status = useQuickstartStatus()
  const [creating, setCreating] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1")
    } catch {
      setDismissed(false)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // Best-effort only.
    }
  }

  const createTestKey = async () => {
    setCreating(true)
    try {
      const res = await fetchWithSession("/api/checkout/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "test" }),
      })
      const body = (await res.json().catch(() => ({}))) as { secretKey?: string; error?: string }
      if (!res.ok || !body.secretKey) return
      setRevealedKey(body.secretKey)
      await queryClient.invalidateQueries({ queryKey: ["platform-quickstart-status"] })
    } finally {
      setCreating(false)
    }
  }

  if (dismissed || status.isPending || !status.data) return null

  const { hasTestKey, hasCalledApi, hasWebhook } = status.data
  const allDone = hasTestKey && hasCalledApi && hasWebhook
  if (allDone) return null

  // Secrets are reveal-once — `revealedKey` only exists right after this
  // session created one. A returning visit shows a placeholder instead;
  // there's no way to show a real secret again by design.
  const curl = `curl ${APP_URLS.api}/v1/customers \\\n  -H "Authorization: Bearer ${revealedKey ?? "easner_sk_test_..."}"`

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Get started with the Easner API</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Three steps to your first integration. Test mode needs no approval.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          <ChecklistItem done={hasTestKey}>Create a test key</ChecklistItem>
          <ChecklistItem done={hasCalledApi}>Make your first API call</ChecklistItem>
          <ChecklistItem done={hasWebhook}>Add a webhook endpoint</ChecklistItem>
        </ul>

        {!hasTestKey ? (
          <Button type="button" size="sm" disabled={creating} onClick={() => void createTestKey()}>
            {creating ? "Creating…" : "Create your test key"}
          </Button>
        ) : (
          <div className="space-y-3">
            {revealedKey ? (
              <RevealOnceValue
                value={revealedKey}
                note="Store it in your server environment. Easner keeps only a fingerprint."
              />
            ) : null}
            <CheckoutCodeBlock label="Try your first call" code={curl} />
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/console/webhooks" className="text-primary hover:underline">
            Add a webhook →
          </Link>
          <a
            href="https://www.easner.com/developers"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            View the docs →
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
