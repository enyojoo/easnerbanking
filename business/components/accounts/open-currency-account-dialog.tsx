"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import type { AccountCurrencyOffer } from "@/lib/accounts/open-currency-catalog"

type AvailablePayload = {
  defaults: string[]
  enabledExtras: string[]
  offers: (AccountCurrencyOffer & { alreadyAdded: boolean })[]
}

/** Set to true when extra currencies are ready to ship in the UI. */
const OPEN_CURRENCY_ACCOUNT_ENABLED = false

export function OpenCurrencyAccountDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AvailablePayload | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithSession("/api/accounts/available-currencies", {
        headers: { "X-Easner-Noah-Scope": "business" },
      })
      const json = (await res.json()) as AvailablePayload & { error?: string }
      if (!res.ok) {
        setError(json.error ?? "Could not load currencies.")
        return
      }
      setData(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load currencies.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (OPEN_CURRENCY_ACCOUNT_ENABLED && open) void load()
  }, [open, load])

  const openCurrency = async (code: string) => {
    setBusy(code)
    setError(null)
    try {
      const res = await fetchWithSession("/api/accounts/open-currency", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Easner-Noah-Scope": "business",
        },
        body: JSON.stringify({ currency: code }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(json.error ?? "Could not open account.")
        return
      }
      setOpen(false)
      onAdded()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open account.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog
      open={OPEN_CURRENCY_ACCOUNT_ENABLED ? open : false}
      onOpenChange={(next) => {
        if (!OPEN_CURRENCY_ACCOUNT_ENABLED) return
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={!OPEN_CURRENCY_ACCOUNT_ENABLED}
          title={
            OPEN_CURRENCY_ACCOUNT_ENABLED
              ? undefined
              : "Opening additional currency accounts is not available yet."
          }
        >
          <Plus className="h-4 w-4" />
          Open Currency Account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Open currency account</DialogTitle>
          <DialogDescription>
            Add another currency to your dashboard. Availability depends on verification tier and the payment provider.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data ? (
          <ul className="space-y-2">
            {data.offers.map((o) => {
              const disabled = Boolean(o.disabledReason) || o.alreadyAdded
              return (
                <li
                  key={o.code}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {o.code} — {o.label}
                    </p>
                    {o.disabledReason ? (
                      <p className="text-xs text-muted-foreground">{o.disabledReason}</p>
                    ) : o.alreadyAdded ? (
                      <p className="text-xs text-muted-foreground">Already added</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Tier {o.tierRequired}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={disabled || busy !== null}
                    onClick={() => void openCurrency(o.code)}
                  >
                    {busy === o.code ? "Opening…" : o.alreadyAdded ? "Added" : "Add"}
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
