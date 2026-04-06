"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RecipientForm } from "@/components/recipient-form"
import type { Beneficiary } from "@/lib/recipient-types"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { dataCache, CACHE_KEYS } from "@/lib/cache"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  useTerminalPayoutSetupCached,
  type TerminalPayoutRow,
} from "@/hooks/use-terminal-payout-setup-cached"
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react"

function payoutTitle(p: TerminalPayoutRow): string {
  return (p.account_name && p.account_name.trim()) || p.display_label
}

function payoutDetailLine(p: TerminalPayoutRow): string {
  if (p.detail_line && p.detail_line.trim()) return p.detail_line.trim()
  return p.currency?.trim() || ""
}

function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase()
  }
  const single = parts[0] || "?"
  return single.slice(0, 2).toUpperCase()
}

const TERMINAL_RECIPIENT_TYPES = ["bank", "mobile"] as const

export function SetupPayoutDialog() {
  const { user } = useAuth()
  const { data: setup, setData: setSetupData, loading: setupLoading, refetch } =
    useTerminalPayoutSetupCached()
  const [open, setOpen] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const payouts = setup.payouts
  const savedDefaultId = setup.defaultTerminalPayoutId

  /** Terminal sessions read default payout; keep hub list in sync after payout/settings changes. */
  const afterPayoutMutation = useCallback(async () => {
    if (user?.id) {
      dataCache.invalidate(CACHE_KEYS.TERMINAL_SESSIONS(user.id))
    }
    await refetch()
  }, [refetch, user?.id])

  useEffect(() => {
    if (!open) {
      setShowAddPanel(false)
      return
    }
    if (!user?.id) return
    const key = CACHE_KEYS.TERMINAL_PAYOUT_SETUP(user.id)
    if (dataCache.isStale(key)) {
      void refetch()
    }
  }, [open, user?.id, refetch])

  const hasPayouts = payouts.length > 0
  const noDefaultChosen = hasPayouts && savedDefaultId === null

  const setAsDefault = (payoutId: string) => {
    let rollback: string | null = null
    setSetupData((prev) => {
      rollback = prev.defaultTerminalPayoutId ?? null
      return { ...prev, defaultTerminalPayoutId: payoutId }
    })
    void (async () => {
      try {
        const res = await fetchWithSession("/api/terminal/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ default_terminal_payout_id: payoutId }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          setSetupData((prev) => ({ ...prev, defaultTerminalPayoutId: rollback }))
          toast.error(data.error || "Could not set default.")
          return
        }
        if (user?.id) {
          dataCache.invalidate(CACHE_KEYS.TERMINAL_SESSIONS(user.id))
        }
        await refetch()
      } catch (e) {
        setSetupData((prev) => ({ ...prev, defaultTerminalPayoutId: rollback }))
        toast.error(e instanceof Error ? e.message : "Could not set default.")
      }
    })()
  }

  const clearDefault = () => {
    let rollback: string | null = null
    setSetupData((prev) => {
      rollback = prev.defaultTerminalPayoutId ?? null
      return { ...prev, defaultTerminalPayoutId: null }
    })
    void (async () => {
      try {
        const res = await fetchWithSession("/api/terminal/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ default_terminal_payout_id: null }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          setSetupData((prev) => ({ ...prev, defaultTerminalPayoutId: rollback }))
          toast.error(data.error || "Could not clear default.")
          return
        }
        if (user?.id) {
          dataCache.invalidate(CACHE_KEYS.TERMINAL_SESSIONS(user.id))
        }
        await refetch()
      } catch (e) {
        setSetupData((prev) => ({ ...prev, defaultTerminalPayoutId: rollback }))
        toast.error(e instanceof Error ? e.message : "Could not clear default.")
      }
    })()
  }

  const removePayout = async (p: TerminalPayoutRow) => {
    setDeletingId(p.id)
    try {
      const res = await fetchWithSession(
        `/api/terminal/payouts?id=${encodeURIComponent(p.id)}`,
        { method: "DELETE" },
      )
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error || "Could not remove payout method.")
        return
      }
      await afterPayoutMutation()
      toast.success("Payout method removed.")
    } finally {
      setDeletingId(null)
    }
  }

  /** After RecipientForm saves a new recipient, link it to Terminal payouts. */
  const onNewRecipientSaved = (b: Beneficiary) => {
    void (async () => {
      try {
        const res = await fetchWithSession("/api/terminal/payouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient_id: b.id }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(data.error || "Recipient saved, but could not add as terminal payout. Try again from the list.")
          return
        }
        if (user?.id) {
          dataCache.invalidate(CACHE_KEYS.RECIPIENTS(user.id))
        }
        await afterPayoutMutation()
        setShowAddPanel(false)
        toast.success("Payout saved. Select a default account below if needed.")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not link payout.")
      }
    })()
  }

  const listLoading = open && setupLoading

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Setup payout
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          showAddPanel && !listLoading ? "max-w-lg" : "max-w-md",
          showAddPanel && !listLoading && "max-h-[90vh] overflow-y-auto",
        )}
      >
        <DialogHeader className={showAddPanel && !listLoading ? "space-y-3" : undefined}>
          {showAddPanel && !listLoading ? (
            <>
              <div className="flex items-center gap-2 pr-8">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setShowAddPanel(false)}
                  aria-label="Back to terminal payout accounts"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </Button>
                <DialogTitle className="text-left">Add Payout Account</DialogTitle>
              </div>
              <DialogDescription>
                Enter bank account or mobile money details. The recipient is saved and linked to terminal payouts.
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>Terminal payout accounts</DialogTitle>
              <DialogDescription className="sr-only">
                Manage bank and mobile money payout destinations and optional default for terminal.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {listLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
          </div>
        ) : showAddPanel ? (
          <RecipientForm
            allowedRecipientTypes={[...TERMINAL_RECIPIENT_TYPES]}
            submitButtonLabel="Save payout"
            onSuccess={() => {}}
            onSuccessWithData={onNewRecipientSaved}
          />
        ) : (
          <div className="mx-auto w-full max-w-sm space-y-4">
            {noDefaultChosen ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
                Mark one account below as your default so we know where to send payouts.
              </div>
            ) : null}

            {!hasPayouts ? (
              <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                No payout accounts yet. Add a new recipient (bank or mobile money) or pick a default after saving.
              </div>
            ) : (
              <div className="space-y-3">
                {payouts.map((p) => {
                  const isDefault = savedDefaultId === p.id
                  const rowBusy = deletingId === p.id
                  const title = payoutTitle(p)
                  const detail = payoutDetailLine(p)
                  const checkId = `terminal-payout-default-${p.id}`
                  return (
                    <div
                      key={p.id}
                      className="flex items-start gap-3 rounded-lg border p-3 sm:p-4"
                    >
                      <div className="flex shrink-0 items-center gap-2 pt-0.5">
                        <Checkbox
                          id={checkId}
                          checked={isDefault}
                          disabled={rowBusy}
                          onCheckedChange={(v) => {
                            if (v === true) setAsDefault(p.id)
                            else if (isDefault) clearDefault()
                          }}
                          aria-label={isDefault ? "Default terminal payout" : "Set as default terminal payout"}
                        />
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <span className="text-sm font-medium text-primary">{initialsFromLabel(title)}</span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Label htmlFor={checkId} className="cursor-pointer text-base font-medium leading-snug">
                          {title}
                        </Label>
                        {detail ? (
                          <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={rowBusy}
                        onClick={() => void removePayout(p)}
                        aria-label={`Remove payout ${title}`}
                      >
                        {deletingId === p.id ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="size-4" aria-hidden />
                        )}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="border-t pt-4">
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                size="sm"
                onClick={() => setShowAddPanel(true)}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add payout account
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
