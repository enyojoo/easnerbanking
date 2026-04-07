"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CurrencyFlag } from "@/components/flags"
import { RecipientForm } from "@/components/recipient-form"
import type { Beneficiary } from "@/lib/recipient-types"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { dataCache, CACHE_KEYS } from "@/lib/cache"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import {
  useTerminalPayoutSetupCached,
  type TerminalPayoutRow,
} from "@/hooks/use-terminal-payout-setup-cached"
import type { TerminalSettlementDestination } from "@/lib/terminal/settlement-destination"
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
  const settlementDestination = setup.settlementDestination
  const defaultBalanceCurrency = setup.defaultBalanceCurrency ?? "USD"
  const pickMode = variant === "pick-recipient"
  const { accountRows, loading: accountsLoading, loadError: accountsLoadError } =
    useBusinessAccountRows()
  const easnerAccountRows = useMemo(
    () => accountRows.filter((a) => a.currency === "USD" || a.currency === "EUR"),
    [accountRows],
  )

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
  const showBankPayoutUi = pickMode || settlementDestination === "bank_payout"
  const noDefaultChosen =
    !pickMode &&
    settlementDestination === "bank_payout" &&
    payouts.length > 0 &&
    savedDefaultId === null

  const patchTerminalSettings = useCallback(
    async (patch: Record<string, unknown>, rollback: () => void) => {
      try {
        const res = await fetchWithSession("/api/terminal/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          rollback()
          toast.error(data.error || "Could not update terminal settings.")
          return
        }
        if (user?.id) {
          dataCache.invalidate(CACHE_KEYS.TERMINAL_PAYOUT_SETUP(user.id))
          dataCache.invalidate(CACHE_KEYS.TERMINAL_SESSIONS(user.id))
        }
        await refetch()
      } catch (e) {
        rollback()
        toast.error(e instanceof Error ? e.message : "Could not update settings.")
      }
    },
    [refetch, user?.id],
  )

  const setSettlementMode = (dest: TerminalSettlementDestination) => {
    if (dest === settlementDestination) return
    const snapshot = setup
    setSetupData((prev) => ({
      ...prev,
      settlementDestination: dest,
      defaultBalanceCurrency:
        dest === "easner_balance" ? (prev.defaultBalanceCurrency ?? "USD") : null,
    }))
    const body =
      dest === "easner_balance" ?
        {
          settlement_destination: "easner_balance",
          default_balance_currency: snapshot.defaultBalanceCurrency ?? "USD",
        }
      : { settlement_destination: "bank_payout", default_balance_currency: null }
    void patchTerminalSettings(body, () => setSetupData(snapshot))
  }

  const setLedgerDefault = (c: "USD" | "EUR") => {
    if (defaultBalanceCurrency === c && settlementDestination === "easner_balance") return
    const snapshot = setup
    setSetupData((prev) => ({
      ...prev,
      settlementDestination: "easner_balance",
      defaultBalanceCurrency: c,
    }))
    void patchTerminalSettings(
      { settlement_destination: "easner_balance", default_balance_currency: c },
      () => setSetupData(snapshot),
    )
  }

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
          dataCache.invalidate(CACHE_KEYS.TERMINAL_PAYOUT_SETUP(user.id))
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
          dataCache.invalidate(CACHE_KEYS.TERMINAL_PAYOUT_SETUP(user.id))
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

  const dialogHeaderClass = "shrink-0 space-y-1.5 pr-10 text-left sm:pr-12"

  const headerBlock =
    listLoading && !embedded ? (
      <DialogHeader className={dialogHeaderClass}>
        <DialogTitle className="text-xl font-semibold leading-snug">Setup payout</DialogTitle>
        <DialogDescription className="sr-only">Terminal settlement configuration</DialogDescription>
      </DialogHeader>
    ) : listLoading ? null
    : embedded ? (
      <div className="sr-only">Terminal payout setup</div>
    ) : (
      <DialogHeader className={dialogHeaderClass}>
        <DialogTitle className="text-xl font-semibold leading-snug">Setup payout</DialogTitle>
        <DialogDescription className="sr-only">Terminal settlement configuration</DialogDescription>
      </DialogHeader>
    )

  return (
    <div className={cn("w-full", !embedded && "flex flex-col gap-6", className)}>
      {headerBlock}

      {listLoading ?
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      : <div className={cn("mx-auto w-full min-w-0 space-y-5", !embedded && "max-w-md")}>
          {!pickMode ?
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="terminal-settlement-type">Settlement</Label>
                <Select
                  value={settlementDestination}
                  onValueChange={(v) => setSettlementMode(v as TerminalSettlementDestination)}
                >
                  <SelectTrigger id="terminal-settlement-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easner_balance">Easner balance</SelectItem>
                    <SelectItem value="bank_payout">External payout</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {settlementDestination === "easner_balance" ?
                <div className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold tracking-tight text-foreground">Easner balance</h3>
                    <p className="text-sm text-muted-foreground">
                      Choose the USD or EUR balance that receives automated settlement.
                    </p>
                  </div>
                  {accountsLoadError ?
                    <p className="text-sm text-destructive">{accountsLoadError}</p>
                  : null}
                  {accountsLoading ?
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
                    </div>
                  : <div className="max-h-[min(520px,60vh)] space-y-3 overflow-y-auto pr-1">
                      {easnerAccountRows.map((account) => {
                        const checkId = `easner-ledger-${account.currency}`
                        const isDefault = defaultBalanceCurrency === account.currency
                        return (
                          <div
                            key={account.id}
                            className={cn(
                              "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border p-3 sm:p-4",
                              isDefault && "border-primary ring-1 ring-primary/30",
                            )}
                          >
                            <div className="flex items-center gap-2 self-center">
                              <Checkbox
                                id={checkId}
                                checked={isDefault}
                                onCheckedChange={(v) => {
                                  if (v === true) {
                                    setLedgerDefault(account.currency as "USD" | "EUR")
                                  } else if (isDefault) {
                                    const other =
                                      account.currency === "USD" ? "EUR" : "USD"
                                    setLedgerDefault(other)
                                  }
                                }}
                                aria-label={`Set ${account.currency} balance as default Easner settlement currency`}
                              />
                              <CurrencyFlag
                                currency={account.currency}
                                size={36}
                                className="rounded-md shrink-0"
                              />
                            </div>
                            <Label
                              htmlFor={checkId}
                              className="self-center min-w-0 cursor-pointer text-base font-medium leading-snug"
                            >
                              {account.currency} Balance
                            </Label>
                            {account.bankName && account.bankName !== "—" ?
                              <p className="col-start-2 text-sm text-muted-foreground">
                                {account.bankName}
                              </p>
                            : null}
                            {account.accountNumber && account.accountNumber !== "—" ?
                              <p className="col-start-2 font-mono text-sm text-muted-foreground">
                                {account.accountNumber}
                              </p>
                            : null}
                          </div>
                        )
                      })}
                    </div>}
                </div>
              : null}
            </div>
          : null}

          {showBankPayoutUi ?
            <>
              {!pickMode && settlementDestination === "bank_payout" ?
                <div className="space-y-1">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">External payout</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose the bank or mobile money account that receives automated settlement.
                  </p>
                </div>
              : null}

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
                              aria-label={
                                isDefault ? "Default terminal payout" : "Set as default terminal payout"
                              }
                            />}
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            <span className="text-sm font-medium text-primary">{initialsFromLabel(title)}</span>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          {pickMode ?
                            <p className="text-base font-medium leading-snug">{title}</p>
                          : <Label
                              htmlFor={checkId}
                              className="cursor-pointer text-base font-medium leading-snug"
                            >
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

              <div className={cn("border-t", embedded ? "pt-4" : "pt-5")}>
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
            </>
          : null}
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
