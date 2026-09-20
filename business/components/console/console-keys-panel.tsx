"use client"

import { useState } from "react"
import { toast } from "sonner"
import { APP_URLS } from "@easner/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckoutCodeBlock, RevealOnceValue } from "@/components/checkout/checkout-code-block"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { PLATFORM_KEY_SCOPES, type PlatformKeyScope } from "@/lib/platform/scopes"
import {
  useCheckoutSettings,
  type CheckoutApiKey,
} from "@/hooks/use-checkout-settings"

const SCOPE_LABELS: Record<PlatformKeyScope, string> = {
  checkout: "Checkout",
  "accounts.read": "Accounts (read)",
  "accounts.write": "Accounts (write)",
  "transfers.write": "Transfers",
}

function CreateKeyDialog({ mode, onCreated }: { mode: "test" | "live"; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<Set<PlatformKeyScope>>(new Set(PLATFORM_KEY_SCOPES))
  const [creating, setCreating] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)

  const toggleScope = (scope: PlatformKeyScope) => {
    setScopes((prev) => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  const create = async () => {
    setCreating(true)
    try {
      const res = await fetchWithSession("/api/checkout/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, name: name.trim() || undefined, scopes: [...scopes] }),
      })
      const body = (await res.json().catch(() => ({}))) as { secretKey?: string; error?: string }
      if (!res.ok || !body.secretKey) {
        toast.error(body.error || "Could not create key")
        return
      }
      setRevealed(body.secretKey)
      onCreated()
    } finally {
      setCreating(false)
    }
  }

  const close = () => {
    setOpen(false)
    setName("")
    setScopes(new Set(PLATFORM_KEY_SCOPES))
    setRevealed(null)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Create {mode} key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a {mode} key</DialogTitle>
        </DialogHeader>
        {revealed ? (
          <div className="space-y-3">
            <RevealOnceValue
              value={revealed}
              note="Store it in your server environment. Easner keeps only a fingerprint."
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Backend prod"
              />
            </div>
            <div className="space-y-2">
              <Label>Capabilities</Label>
              {PLATFORM_KEY_SCOPES.map((scope) => (
                <div key={scope} className="flex items-center gap-2">
                  <Checkbox
                    id={`scope-${scope}`}
                    checked={scopes.has(scope)}
                    onCheckedChange={() => toggleScope(scope)}
                  />
                  <Label htmlFor={`scope-${scope}`} className="text-sm font-normal">
                    {SCOPE_LABELS[scope]}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          {revealed ? (
            <Button type="button" onClick={close}>
              Done
            </Button>
          ) : (
            <Button type="button" disabled={creating || scopes.size === 0} onClick={() => void create()}>
              {creating ? "Creating…" : "Create key"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function KeyRow({ apiKey, onRevoked }: { apiKey: CheckoutApiKey; onRevoked: () => void }) {
  const [revoking, setRevoking] = useState(false)

  const revoke = async () => {
    setRevoking(true)
    try {
      const res = await fetchWithSession("/api/checkout/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: apiKey.id }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not revoke key")
        return
      }
      toast.success("Key revoked.")
      onRevoked()
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{apiKey.name || "Unnamed key"}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{apiKey.publishable_key}</p>
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={revoking} onClick={() => void revoke()}>
          {revoking ? "Revoking…" : "Revoke"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(apiKey.scopes ?? []).map((scope) => (
          <Badge key={scope} variant="secondary" className="text-[11px] font-normal">
            {SCOPE_LABELS[scope as PlatformKeyScope] ?? scope}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Secret ending {apiKey.secret_key_last4} · Last used{" "}
        {apiKey.last_used_at ? new Date(apiKey.last_used_at).toLocaleString() : "never"}
      </p>
    </div>
  )
}

export function ConsoleKeysPanel() {
  const { data, refetch } = useCheckoutSettings()
  const origins = data?.settings.allowedOrigins ?? []

  return (
    <div className="grid gap-4">
      {(["test", "live"] as const).map((mode) => {
        const keys = (data?.keys ?? []).filter((item) => item.mode === mode)
        return (
          <div key={mode} className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium capitalize text-foreground">{mode} keys</p>
              <CreateKeyDialog mode={mode} onCreated={() => void refetch()} />
            </div>
            {keys.length > 0 ? (
              <div className="space-y-3">
                {keys.map((key) => (
                  <KeyRow key={key.id} apiKey={key} onRevoked={() => void refetch()} />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {mode === "live"
                  ? "Create live keys when you are ready to take real payments."
                  : "Start with test keys while you build."}
              </p>
            )}
          </div>
        )
      })}
      {origins.length ? (
        <p className="text-xs text-muted-foreground">Allowed origins for publishable keys: {origins.join(", ")}</p>
      ) : null}
      <CheckoutCodeBlock
        label="Every key authenticates the same way"
        code={`curl ${APP_URLS.api}/v1/customers \\\n  -H "Authorization: Bearer easner_sk_test_..."`}
      />
    </div>
  )
}
