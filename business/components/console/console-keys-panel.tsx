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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckoutCodeBlock, RevealOnceValue } from "@/components/checkout/checkout-code-block"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useConsoleLivemode } from "@/lib/console/livemode-context"
import { PLATFORM_KEY_SCOPES, type PlatformKeyScope } from "@/lib/platform/scopes"
import { useCheckoutSettings, type CheckoutApiKey } from "@/hooks/use-checkout-settings"

const SCOPE_LABELS: Record<PlatformKeyScope, string> = {
  checkout: "Checkout",
  "accounts.read": "Accounts (read)",
  "accounts.write": "Accounts (write)",
  "transfers.write": "Transfers",
}

const BANKING_SCOPES: PlatformKeyScope[] = ["accounts.read", "accounts.write", "transfers.write"]
const CHECKOUT_SCOPES: PlatformKeyScope[] = ["checkout"]

function envSnippet(secretKey: string, publishableKey: string) {
  return `EASNER_SECRET_KEY=${secretKey}
EASNER_PUBLISHABLE_KEY=${publishableKey}`
}

function CreateKeyDialog({
  mode,
  onCreated,
}: {
  mode: "test" | "live"
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [restricted, setRestricted] = useState(false)
  const [scopes, setScopes] = useState<Set<PlatformKeyScope>>(new Set(PLATFORM_KEY_SCOPES))
  const [creating, setCreating] = useState(false)
  const [revealed, setRevealed] = useState<{ secret: string; publishable: string } | null>(null)

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
      const body = (await res.json().catch(() => ({}))) as {
        secretKey?: string
        key?: { publishable_key?: string }
        error?: string
      }
      if (!res.ok || !body.secretKey) {
        toast.error(body.error || "Could not create key")
        return
      }
      setRevealed({
        secret: body.secretKey,
        publishable: body.key?.publishable_key ?? "",
      })
      onCreated()
    } finally {
      setCreating(false)
    }
  }

  const close = () => {
    setOpen(false)
    setName("")
    setRestricted(false)
    setScopes(new Set(PLATFORM_KEY_SCOPES))
    setRevealed(null)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
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
              value={revealed.secret}
              note="Store it in your server environment. Easner keeps only a fingerprint."
            />
            <CheckoutCodeBlock
              label=".env"
              code={envSnippet(revealed.secret, revealed.publishable || "easner_pk_…")}
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
            <div className="flex items-center gap-2">
              <Checkbox
                id="restricted-key"
                checked={restricted}
                onCheckedChange={(checked) => {
                  const next = Boolean(checked)
                  setRestricted(next)
                  setScopes(next ? new Set() : new Set(PLATFORM_KEY_SCOPES))
                }}
              />
              <Label htmlFor="restricted-key" className="text-sm font-normal">
                Restricted — fewer scopes
              </Label>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Banking</Label>
                {BANKING_SCOPES.map((scope) => (
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
              <div className="space-y-2">
                <Label>Checkout</Label>
                {CHECKOUT_SCOPES.map((scope) => (
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

function KeyRow({
  apiKey,
  onChanged,
}: {
  apiKey: CheckoutApiKey
  onChanged: () => void
}) {
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [rolled, setRolled] = useState<{ secret: string; publishable: string } | null>(null)

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
      setRevokeOpen(false)
      onChanged()
    } finally {
      setRevoking(false)
    }
  }

  const roll = async () => {
    setRolling(true)
    try {
      const res = await fetchWithSession("/api/checkout/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: apiKey.mode,
          name: apiKey.name ? `${apiKey.name} (rolled)` : undefined,
          scopes: apiKey.scopes ?? [...PLATFORM_KEY_SCOPES],
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        secretKey?: string
        key?: { publishable_key?: string }
        error?: string
      }
      if (!res.ok || !body.secretKey) {
        toast.error(body.error || "Could not mint a replacement key")
        return
      }
      setRolled({ secret: body.secretKey, publishable: body.key?.publishable_key ?? "" })
      onChanged()
    } finally {
      setRolling(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{apiKey.name || "Unnamed key"}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{apiKey.publishable_key}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" size="sm" variant="outline" disabled={rolling} onClick={() => void roll()}>
            {rolling ? "Rolling…" : "Roll"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRevokeOpen(true)}>
            Revoke
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(apiKey.scopes ?? []).map((scope) => (
          <Badge key={scope} variant="secondary" className="text-[11px] font-normal">
            {SCOPE_LABELS[scope as PlatformKeyScope] ?? scope}
          </Badge>
        ))}
      </div>
      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests signed with this secret will fail immediately. Mint a replacement first if anything still
              depends on it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void revoke()} disabled={revoking}>
              {revoking ? "Revoking…" : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={Boolean(rolled)} onOpenChange={(open) => !open && setRolled(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replacement key</DialogTitle>
          </DialogHeader>
          {rolled ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Swap this in, then revoke the old key. Shown once.
              </p>
              <RevealOnceValue value={rolled.secret} note="Store it in your server environment." />
              <CheckoutCodeBlock
                label=".env"
                code={envSnippet(rolled.secret, rolled.publishable || "easner_pk_…")}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setRolled(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function ConsoleKeysPanel() {
  const { livemode } = useConsoleLivemode()
  const { data, refetch } = useCheckoutSettings()
  const origins = data?.settings.allowedOrigins ?? []
  const keys = (data?.keys ?? []).filter((item) => item.mode === livemode)

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium capitalize text-foreground">{livemode} keys</p>
            <p className="text-xs text-muted-foreground">Create as many as you need for this mode.</p>
          </div>
          <CreateKeyDialog mode={livemode} onCreated={() => void refetch()} />
        </div>
        {keys.length > 0 ? (
          <div className="space-y-3">
            {keys.map((key) => (
              <KeyRow key={key.id} apiKey={key} onChanged={() => void refetch()} />
            ))}
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {livemode === "live"
              ? "Create live keys when you are ready to take real payments."
              : "Start with test keys while you build."}
          </p>
        )}
      </div>
      {origins.length ? (
        <p className="text-xs text-muted-foreground">Allowed origins for publishable keys: {origins.join(", ")}</p>
      ) : null}
      <CheckoutCodeBlock
        label="Every key authenticates the same way"
        code={`curl ${APP_URLS.api}/v1/customers \\\n  -H "Authorization: Bearer easner_sk_${livemode}_..."`}
      />
    </div>
  )
}
