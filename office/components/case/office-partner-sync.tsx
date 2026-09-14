"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import { consumerBankKycRail } from "@/lib/case/status"
import type { OfficeIdentityUser, OfficeVirtualAccount } from "@/lib/case/types"

export function OfficePartnerSync({
  kind,
  subjectId,
  user,
  ownerUserId,
  virtualAccounts,
  mode = "both",
}: {
  kind: "user" | "business"
  subjectId: string
  user?: OfficeIdentityUser | null
  ownerUserId?: string | null
  virtualAccounts?: OfficeVirtualAccount[]
  mode?: "bridge" | "noah" | "both"
}) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const consumerRail = user ? consumerBankKycRail(user) : null
  const hasNoahVas = (virtualAccounts ?? []).some((va) => va.provider.toLowerCase() === "noah")
  const noahScoped = kind === "user" ? consumerRail === "noah" || hasNoahVas : hasNoahVas
  const showBridge =
    mode !== "noah" && (kind === "business" || consumerRail === "bridge" || Boolean(user?.bridge_customer_id))
  const showNoah = mode !== "bridge" && noahScoped

  async function invalidate() {
    void queryClient.invalidateQueries({ queryKey: officeKeys.subjectBanking(kind, subjectId) })
    void queryClient.invalidateQueries({ queryKey: officeKeys.users() })
    void queryClient.invalidateQueries({ queryKey: officeKeys.businesses() })
    if (kind === "business") {
      void queryClient.invalidateQueries({ queryKey: officeKeys.kybPacket(subjectId) })
    }
  }

  async function syncBridge() {
    setBusy("bridge")
    try {
      const r = await officeFetch(`/api/admin/office/subjects/${kind}/${encodeURIComponent(subjectId)}/bridge-sync`, {
        method: "POST",
      })
      const d = (await r.json()) as { error?: string; kycStatus?: string; provisioned?: boolean }
      if (!r.ok) throw new Error(d.error || "Bridge sync failed")
      toast.success(
        d.provisioned ? "Bridge synced and virtual accounts provisioned." : `Bridge synced · ${d.kycStatus || "ok"}`,
      )
      await invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bridge sync failed")
    } finally {
      setBusy(null)
    }
  }

  async function syncNoah() {
    const userId = kind === "user" ? subjectId : ownerUserId
    if (!userId) {
      toast.error("No owner user to sync Noah.")
      return
    }
    setBusy("noah")
    try {
      const r = await officeFetch("/api/admin/noah/sync-user", {
        method: "POST",
        body: JSON.stringify({
          userId,
          accountScope: kind === "business" ? "business" : "individual",
        }),
      })
      const d = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(d.error || "Noah sync failed")
      toast.success("Noah synced.")
      await invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Noah sync failed")
    } finally {
      setBusy(null)
    }
  }

  async function reprovisionNoah() {
    setBusy("reprovision")
    try {
      const r = await officeFetch("/api/admin/ops/reprovision-bank-onramp-va", {
        method: "POST",
        body: JSON.stringify(kind === "business" ? { businessId: subjectId } : { userId: subjectId }),
      })
      const d = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(d.error || "Noah reprovision failed")
      toast.success("Noah virtual accounts reprovisioned.")
      await invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Noah reprovision failed")
    } finally {
      setBusy(null)
    }
  }

  if (!showBridge && !showNoah) return null

  return (
    <div className="flex flex-wrap gap-2">
      {showBridge ? (
        <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void syncBridge()}>
          {busy === "bridge" ? "Syncing Bridge…" : "Sync Bridge"}
        </Button>
      ) : null}
      {showNoah ? (
        <>
          <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void syncNoah()}>
            {busy === "noah" ? "Syncing Noah…" : "Sync Noah"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={Boolean(busy)}
            onClick={() => void reprovisionNoah()}
          >
            {busy === "reprovision" ? "Reprovisioning…" : "Reprovision Noah VAs"}
          </Button>
        </>
      ) : null}
    </div>
  )
}
