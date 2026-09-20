"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeSubjectBanking } from "@/hooks/queries"
import { accountRestrictionOfficeLiftBlockedCopy, type AccountRestrictionSource } from "@easner/shared"

type Phase = "wind_down" | "locked" | null
type Confirm = "restrict" | "close" | "lift" | "return"

export function OfficeRestrictionControls({
  kind,
  subjectId,
  phase,
  source,
  windDownEndsAt,
  compact = false,
}: {
  kind: "user" | "business"
  subjectId: string
  phase?: Phase
  source?: AccountRestrictionSource | null
  windDownEndsAt?: string | null
  compact?: boolean
}) {
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [reason, setReason] = useState("")
  const [destination, setDestination] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<"USD" | "EUR">("USD")
  const [busy, setBusy] = useState(false)
  const path =
    kind === "business"
      ? `/api/admin/office/businesses/${subjectId}/restriction`
      : `/api/admin/office/users/${subjectId}/restriction`
  const canLift = Boolean(phase && source === "office")
  const bankingQuery = useOfficeSubjectBanking(kind, subjectId, confirm === "return")
  const balances = bankingQuery.data?.balances ?? []
  const pickedCurrency = useRef(false)
  const available = useMemo(() => {
    const row = balances.find((b) => b.currency === currency)
    return Number(row?.available ?? 0)
  }, [balances, currency])

  useEffect(() => {
    if (confirm !== "return") {
      pickedCurrency.current = false
      return
    }
    if (pickedCurrency.current || !balances.length) return
    const withBalance = balances.find((b) => Number(b.available) > 0)
    if (withBalance?.currency === "EUR" || withBalance?.currency === "USD") {
      setCurrency(withBalance.currency)
      pickedCurrency.current = true
    }
  }, [balances, confirm])

  useEffect(() => {
    if (confirm !== "return") return
    if (!Number.isFinite(available) || available <= 0) return
    setAmount((prev) => (prev.trim() ? prev : available.toFixed(2)))
  }, [available, confirm, currency])

  async function invalidate() {
    void queryClient.invalidateQueries({ queryKey: officeKeys.users() })
    void queryClient.invalidateQueries({ queryKey: officeKeys.businesses() })
    void queryClient.invalidateQueries({ queryKey: officeKeys.subjectBanking(kind, subjectId) })
    void queryClient.invalidateQueries({ queryKey: officeKeys.subjectAudit(subjectId) })
  }

  function resetForm() {
    setConfirm(null)
    setReason("")
    setDestination("")
    setAmount("")
    setCurrency("USD")
  }

  async function apply(mode: "wind_down" | "closed") {
    setBusy(true)
    try {
      const r = await officeFetch(path, {
        method: "POST",
        body: JSON.stringify({
          mode,
          reason:
            reason.trim() ||
            (mode === "closed" ? "Office account closed" : "Office compliance restriction"),
        }),
      })
      const d = (await r.json().catch(() => ({}))) as { error?: string; applied?: boolean }
      if (!r.ok) throw new Error(d.error || "Failed")
      toast.success(mode === "closed" ? "Account closed." : "Account restricted.")
      resetForm()
      await invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  async function lift() {
    setBusy(true)
    try {
      const r = await officeFetch(path, { method: "DELETE" })
      const d = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(d.error || "Failed to lift")
      toast.success("Restriction lifted.")
      resetForm()
      await invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  async function returnRemaining() {
    setBusy(true)
    try {
      const r = await officeFetch(
        `/api/admin/office/subjects/${kind}/${encodeURIComponent(subjectId)}/return-remaining`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: reason.trim(),
            destination: destination.trim(),
            amount: Number(amount),
            currency,
          }),
        },
      )
      const d = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(d.error || "Failed to return")
      toast.success("Returned.")
      resetForm()
      await invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  const returnReady =
    Boolean(reason.trim()) && Boolean(destination.trim()) && Number(amount) > 0

  return (
    <>
      {!compact && phase ? (
        <p className="text-xs text-muted-foreground">
          {phase === "locked" ? "Closed" : "Restricted"}
          {source ? ` · ${source}` : ""}
          {phase === "wind_down" && windDownEndsAt
            ? ` · wind-down until ${new Date(windDownEndsAt).toLocaleString()}`
            : ""}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-oxblood/30 text-oxblood"
          disabled={busy}
          onClick={() => setConfirm("return")}
        >
          Return
        </Button>
        {phase ? (
          canLift ? (
            <>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirm("lift")}>
                {phase === "locked" ? "Reopen account" : "Lift restriction"}
              </Button>
              {phase === "wind_down" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-oxblood/30 text-oxblood"
                  disabled={busy}
                  onClick={() => setConfirm("close")}
                >
                  Close now
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {accountRestrictionOfficeLiftBlockedCopy(source)}
            </p>
          )
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirm("restrict")}>
              Restrict
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-oxblood/30 text-oxblood"
              disabled={busy}
              onClick={() => setConfirm("close")}
            >
              Close
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && resetForm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "lift"
                ? "Lift restriction?"
                : confirm === "close"
                  ? "Close account?"
                  : confirm === "return"
                    ? "Return?"
                    : "Restrict account?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "lift"
                ? "The account will be able to send and receive again."
                : confirm === "close"
                  ? "Login will be blocked immediately."
                  : confirm === "return"
                    ? "Office sends this amount from the vault to the destination. The customer does not authorize it."
                    : "Deposits and transfers will be blocked. The customer has 7 days to contact support."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "return" ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="office-return-destination">Destination</Label>
                <Input
                  id="office-return-destination"
                  placeholder="Solana address"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={(value) => {
                    if (value === "EUR" || value === "USD") {
                      setCurrency(value)
                      setAmount("")
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">
                        USD{balances.length ? ` · ${availableForDisplay(balances, "USD")}` : ""}
                      </SelectItem>
                      <SelectItem value="EUR">
                        EUR{balances.length ? ` · ${availableForDisplay(balances, "EUR")}` : ""}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="office-return-amount">Amount</Label>
                  <Input
                    id="office-return-amount"
                    inputMode="decimal"
                    placeholder={available > 0 ? available.toFixed(2) : "0.00"}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="office-return-reason">Reason</Label>
                <Input
                  id="office-return-reason"
                  placeholder="Reason (required for the record)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
          ) : confirm !== "lift" ? (
            <Input
              placeholder="Reason (required for the record)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              disabled={
                busy ||
                (confirm === "return" ? !returnReady : confirm !== "lift" && !reason.trim())
              }
              onClick={() => {
                if (confirm === "lift") void lift()
                else if (confirm === "close") void apply("closed")
                else if (confirm === "return") void returnRemaining()
                else void apply("wind_down")
              }}
            >
              {confirm === "return" ? "Return" : "Confirm"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function availableForDisplay(
  balances: Array<{ currency: string; available: number }>,
  currency: "USD" | "EUR",
): string {
  const available = Number(balances.find((b) => b.currency === currency)?.available ?? 0)
  return available.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
