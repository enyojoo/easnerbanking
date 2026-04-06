"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Loader2, Plus, Trash2 } from "lucide-react"

export type TerminalPayoutSetupPanelVariant = "manage-default" | "pick-recipient"

export type TerminalPayoutSetupPanelProps = {
  /** When true, refetches payout setup if cache is stale (e.g. dialog open or inline page mounted). */
  active: boolean
  variant: TerminalPayoutSetupPanelVariant
  /** `pick-recipient`: controlled recipient id from terminal payout rows. */
  selectedRecipientId?: string | null
  onSelectRecipientId?: (recipientId: string) => void
  /** Dialog vs Card: dialog uses DialogHeader; embedded uses plain headings inside a parent Card. */
  embedded?: boolean
  /** Invalidate payout setup cache and refetch when the panel becomes active (fresh list on /autopayout/create). */
  syncListsOnMount?: boolean
  className?: string
}

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

export function TerminalPayoutSetupPanel({
  active,
  variant,
  selectedRecipientId = null,
  onSelectRecipientId,
  embedded = false,
  syncListsOnMount = false,
  className,
}: TerminalPayoutSetupPanelProps) {
  const { user } = useAuth()
  const { data: setup, setData: setSetupData, loading: setupLoading, refetch } =
    useTerminalPayoutSetupCached()
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const syncMountRef = useRef(false)

  const payouts = setup.payouts
  const savedDefaultId = setup.defaultTerminalPayoutId
  const pickMode = variant === "pick-recipient"

  const afterPayoutMutation = useCallback(async () => {
    if (user?.id) {
      dataCache.invalidate(CACHE_KEYS.TERMINAL_SESSIONS(user.id))
    }
    await refetch()
  }, [refetch, user?.id])

  const linkRecipientToTerminal = useCallback(
    async (recipientId: string): Promise<boolean> => {
      try {
        const res = await fetchWithSession("/api/terminal/payouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient_id: recipientId }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(data.error || "Could not link payout account.")
          return false
        }
        if (user?.id) {
          dataCache.invalidate(CACHE_KEYS.RECIPIENTS(user.id))
        }
        await afterPayoutMutation()
        return true
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not link payout.")
        return false
      }
    },
    [afterPayoutMutation, user?.id],
  )

  useEffect(() => {
    if (!active) {
      setShowAddPanel(false)
      return
    }
    if (!user?.id) return
    const key = CACHE_KEYS.TERMINAL_PAYOUT_SETUP(user.id)
    if (dataCache.isStale(key)) {
      void refetch()
    }
  }, [active, user?.id, refetch])

  useEffect(() => {
    if (!active) syncMountRef.current = false
  }, [active])

  useEffect(() => {
    if (!syncListsOnMount || !active || !user?.id) return
    if (syncMountRef.current) return
    syncMountRef.current = true
    dataCache.invalidate(CACHE_KEYS.TERMINAL_PAYOUT_SETUP(user.id))
    void refetch()
  }, [syncListsOnMount, active, user?.id, refetch])

  const hasPayouts = payouts.length > 0
  const noDefaultChosen = !pickMode && payouts.length > 0 && savedDefaultId === null

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

  const onNewRecipientSaved = (b: Beneficiary) => {
    void (async () => {
      const ok = await linkRecipientToTerminal(b.id)
      if (!ok) return
      setShowAddPanel(false)
      if (pickMode) {
        onSelectRecipientId?.(b.id)
      }
      toast.success(
        pickMode ? "Payout account added and selected." : "Payout saved. Select a default account below if needed.",
      )
    })()
  }

  const listLoading = active && setupLoading

  useEffect(() => {
    if (!pickMode || !onSelectRecipientId || !active) return
    if (setupLoading) return
    const valid =
      selectedRecipientId != null &&
      selectedRecipientId !== "" &&
      payouts.some((p) => p.recipient_id === selectedRecipientId)
    if (valid) return
    if (!payouts.length) return
    const def = savedDefaultId
    const row = def ? payouts.find((p) => p.id === def) : null
    const pick = row ?? payouts[0]
    if (pick) onSelectRecipientId(pick.recipient_id)
  }, [
    pickMode,
    onSelectRecipientId,
    active,
    payouts,
    setupLoading,
    selectedRecipientId,
    savedDefaultId,
  ])

  const headerBlock =
    listLoading && !embedded ? (
      <DialogHeader>
        <DialogTitle>Terminal payout accounts</DialogTitle>
        <DialogDescription className="sr-only">
          Manage bank and mobile money payout destinations and optional default for terminal.
        </DialogDescription>
      </DialogHeader>
    ) : listLoading ? null
    : embedded ? (
      <div className="sr-only">Manage bank and mobile money payout destinations.</div>
    ) : (
      <DialogHeader>
        <DialogTitle>Terminal payout accounts</DialogTitle>
        <DialogDescription className="sr-only">
          Manage bank and mobile money payout destinations and optional default for terminal.
        </DialogDescription>
      </DialogHeader>
    )

  return (
    <div className={cn("w-full", className)}>
      {headerBlock}

      {listLoading ?
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      : <div className={cn("mx-auto w-full space-y-4", !embedded && "max-w-sm")}>
          {noDefaultChosen ?
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              Mark one account below as your default so we know where to send payouts.
            </div>
          : null}

          {!hasPayouts ?
            <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
              {pickMode ?
                "Add a bank or mobile money payout account to link this placard's settlements."
              : "No payout accounts yet. Add a new recipient (bank or mobile money) or pick a default after saving."}
            </div>
          : <div className="max-h-[min(520px,60vh)] space-y-3 overflow-y-auto pr-1">
              {payouts.map((p) => {
                const isDefault = savedDefaultId === p.id
                const rowBusy = deletingId === p.id
                const title = payoutTitle(p)
                const detail = payoutDetailLine(p)
                const checkId = `terminal-payout-default-${p.id}`
                const isPicked = pickMode && selectedRecipientId === p.recipient_id
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 sm:p-4",
                      pickMode && "cursor-pointer transition-colors hover:bg-muted/40",
                      pickMode && isPicked && "border-primary ring-1 ring-primary/30",
                    )}
                    role={pickMode ? "button" : undefined}
                    tabIndex={pickMode ? 0 : undefined}
                    onClick={
                      pickMode ?
                        () => {
                          if (rowBusy) return
                          onSelectRecipientId?.(p.recipient_id)
                        }
                      : undefined
                    }
                    onKeyDown={
                      pickMode ?
                        (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            if (rowBusy) return
                            onSelectRecipientId?.(p.recipient_id)
                          }
                        }
                      : undefined
                    }
                  >
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      {pickMode ?
                        <div
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground",
                            isPicked && "border-primary",
                          )}
                          aria-hidden
                        >
                          {isPicked ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                        </div>
                      : <Checkbox
                          id={checkId}
                          checked={isDefault}
                          disabled={rowBusy}
                          onCheckedChange={(v) => {
                            if (v === true) setAsDefault(p.id)
                            else if (isDefault) clearDefault()
                          }}
                          aria-label={isDefault ? "Default terminal payout" : "Set as default terminal payout"}
                        />}
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <span className="text-sm font-medium text-primary">{initialsFromLabel(title)}</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      {pickMode ?
                        <p className="text-base font-medium leading-snug">{title}</p>
                      : <Label htmlFor={checkId} className="cursor-pointer text-base font-medium leading-snug">
                          {title}
                        </Label>}
                      {detail ?
                        <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
                      : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={rowBusy}
                      onClick={(e) => {
                        e.stopPropagation()
                        void removePayout(p)
                      }}
                      aria-label={`Remove payout ${title}`}
                    >
                      {deletingId === p.id ?
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      : <Trash2 className="size-4" aria-hidden />}
                    </Button>
                  </div>
                )
              })}
            </div>
          }

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
      }

      <Dialog open={showAddPanel} onOpenChange={setShowAddPanel}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Payout Account</DialogTitle>
            <DialogDescription>
              Enter bank account or mobile money details. The recipient is saved and linked to terminal payouts.
            </DialogDescription>
          </DialogHeader>
          <RecipientForm
            allowedRecipientTypes={[...TERMINAL_RECIPIENT_TYPES]}
            submitButtonLabel="Save payout"
            onSuccess={() => {}}
            onSuccessWithData={onNewRecipientSaved}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
