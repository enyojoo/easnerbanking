"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { accountRestrictionOfficeLiftBlockedCopy, type AccountRestrictionSource } from "@easner/shared"

type Phase = "wind_down" | "locked" | null

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
  const [confirm, setConfirm] = useState<null | "restrict" | "close" | "lift">(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const path =
    kind === "business"
      ? `/api/admin/office/businesses/${subjectId}/restriction`
      : `/api/admin/office/users/${subjectId}/restriction`
  const canLift = Boolean(phase && source === "office")

  async function invalidate() {
    void queryClient.invalidateQueries({ queryKey: officeKeys.users() })
    void queryClient.invalidateQueries({ queryKey: officeKeys.businesses() })
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
      setConfirm(null)
      setReason("")
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
      setConfirm(null)
      await invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

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

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "lift" ? "Lift restriction?" : confirm === "close" ? "Close account?" : "Restrict account?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "lift"
                ? "The account will be able to send and receive again."
                : confirm === "close"
                  ? "Login will be blocked immediately."
                  : "Deposits and transfers will be blocked. The customer has 7 days to contact support."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm !== "lift" ? (
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
              disabled={busy || (confirm !== "lift" && !reason.trim())}
              onClick={() => {
                if (confirm === "lift") void lift()
                else if (confirm === "close") void apply("closed")
                else void apply("wind_down")
              }}
            >
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
