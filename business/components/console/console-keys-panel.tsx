"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CheckoutCodeBlock, RevealOnceValue } from "@/components/checkout/checkout-code-block"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  useCheckoutSettings,
  type CheckoutApiKey,
} from "@/hooks/use-checkout-settings"

export function ConsoleKeysPanel() {
  const { data, refetch } = useCheckoutSettings()
  const [creating, setCreating] = useState<"test" | "live" | null>(null)
  const [revoking, setRevoking] = useState<"test" | "live" | null>(null)
  const [revealed, setRevealed] = useState<{ mode: string; secretKey: string } | null>(null)
  const origins = data?.settings.allowedOrigins ?? []

  const create = async (mode: "test" | "live") => {
    setCreating(mode)
    try {
      const res = await fetchWithSession("/api/checkout/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        secretKey?: string
        key?: CheckoutApiKey
        error?: string
      }
      if (!res.ok || !body.secretKey) {
        toast.error(body.error || "Could not create keys")
        return
      }
      setRevealed({ mode, secretKey: body.secretKey })
      await refetch()
    } finally {
      setCreating(null)
    }
  }

  const revoke = async (mode: "test" | "live") => {
    setRevoking(mode)
    try {
      const res = await fetchWithSession("/api/checkout/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not revoke keys")
        return
      }
      toast.success("Keys revoked.")
      await refetch()
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="grid gap-4">
      {(["test", "live"] as const).map((mode) => {
        const key = (data?.keys ?? []).find((item) => item.mode === mode)
        return (
          <div key={mode} className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium capitalize text-foreground">{mode} keys</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={creating !== null}
                onClick={() => void create(mode)}
              >
                {creating === mode ? "Creating…" : key ? "Rotate" : "Create"}
              </Button>
            </div>
            {key ? (
              <div className="flex flex-col gap-3">
                <CheckoutCodeBlock label="Publishable key (browser)" code={key.publishable_key} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Secret key ending {key.secret_key_last4}. New keys include checkout, accounts, and
                  transfers. Existing checkout-only keys stay checkout-only until you mint a new key.
                </p>
                <p className="text-xs text-muted-foreground">
                  Last used {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "never"}
                  {origins.length ? ` · allowed origins ${origins.join(", ")}` : ""}
                </p>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={revoking !== null || creating !== null}
                    onClick={() => void revoke(mode)}
                  >
                    {revoking === mode ? "Revoking…" : "Revoke"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {mode === "live"
                  ? "Create live keys when you are ready to take real payments and move platform money."
                  : "Start with test keys while you build."}
              </p>
            )}
            {revealed?.mode === mode ? (
              <RevealOnceValue
                value={revealed.secretKey}
                note="Store it in your server environment. Easner keeps only a fingerprint."
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
