"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
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
import { useOfficeUserMfa } from "@/hooks/queries"
import { formatOfficeTimestamp } from "@/lib/format-office-date"
import type { OfficeUserRow } from "@/hooks/queries"
import { OfficeDetailRow, OfficeSection } from "./office-detail-grid"

export function OfficeSecurityPanel({ user }: { user: OfficeUserRow }) {
  const queryClient = useQueryClient()
  const mfaQuery = useOfficeUserMfa(user.id)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const p = user.communicationPreferences
  const usesMobileApp = Boolean(user.hasExpoPushToken)
  const hasBizContext =
    Boolean(user.easner_business_id) || String(user.role || "").toLowerCase() === "business"

  async function resetMfa() {
    setBusy(true)
    try {
      const r = await officeFetch(`/api/admin/office/users/${user.id}/reset-mfa`, { method: "POST" })
      const d = (await r.json().catch(() => ({}))) as { error?: string; message?: string; removed?: number }
      if (!r.ok) throw new Error(d.error || "Failed to reset MFA")
      toast.success(d.message || `Removed ${Number(d.removed ?? 0)} authenticator factor(s).`)
      setConfirmOpen(false)
      void queryClient.invalidateQueries({ queryKey: officeKeys.userMfa(user.id) })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset MFA")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <OfficeSection title="Sign-in">
        <OfficeDetailRow label="Email confirmed">
          {user.email_confirmed_at ? formatOfficeTimestamp(user.email_confirmed_at) : "No"}
        </OfficeDetailRow>
        <OfficeDetailRow label="Authenticator MFA">
          {mfaQuery.isPending && mfaQuery.data === undefined ? (
            <Skeleton className="ml-auto h-8 w-28 sm:ml-0" />
          ) : mfaQuery.data?.hasTotp ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-amber-200 text-amber-900"
              onClick={() => setConfirmOpen(true)}
            >
              <Shield className="h-4 w-4" />
              Reset MFA
            </Button>
          ) : (
            <span className="font-normal text-muted-foreground">Not active</span>
          )}
        </OfficeDetailRow>
      </OfficeSection>

      <OfficeSection title="Communication" divide={false}>
        {p ? (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={p.productUpdates ? "default" : "secondary"}>
              Product {p.productUpdates ? "on" : "off"}
            </Badge>
            <Badge variant={p.securityAlerts ? "default" : "secondary"}>
              Security {p.securityAlerts ? "on" : "off"}
            </Badge>
            <Badge variant={p.marketingEmails ? "default" : "secondary"}>
              Marketing {p.marketingEmails ? "on" : "off"}
            </Badge>
            {hasBizContext ? (
              <>
                {usesMobileApp ? (
                  <Badge variant="outline">Mobile · Push {p.channels.push ? "on" : "off"} · Registered</Badge>
                ) : null}
                <Badge variant="outline">Email {p.channels.email ? "on" : "off"}</Badge>
              </>
            ) : (
              <>
                <Badge variant="outline">
                  Mobile · Push {p.channels.push ? "on" : "off"}
                  {usesMobileApp ? " · Registered" : " · No device"}
                </Badge>
                <Badge variant="outline">Email {p.channels.email ? "on" : "off"}</Badge>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No preferences on file</p>
        )}
      </OfficeSection>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset authenticator MFA?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes TOTP factors for {user.full_name || user.email || "this user"}. Only use this for
              verified support cases.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={() => void resetMfa()}>
              {busy ? "Resetting…" : "Reset MFA"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
