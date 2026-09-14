"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { officeFetch } from "@/lib/api-client"
import { WALLET_SEND_COMPLIANCE_STATUS_LABEL } from "@easner/shared"
import { OfficeSection } from "@/components/case/office-detail-grid"

type Props = {
  businessId: string
  userId?: string
  velocityLimitActive?: boolean
  velocityExpiresAt?: string | null
  velocityMaxSendUsd?: number | null
  velocitySentUsd?: number | null
  velocityTriggerReason?: string | null
  velocityMode?: string | null
  onChanged?: () => void
}

export function WalletSendComplianceOfficePanel({
  businessId,
  userId,
  velocityLimitActive,
  velocityExpiresAt,
  velocityMaxSendUsd,
  velocitySentUsd,
  velocityTriggerReason,
  velocityMode,
  onChanged,
}: Props) {
  const [dailyMaxUsd, setDailyMaxUsd] = useState("25000")
  const [rail, setRail] = useState<"stablecoin" | "fiat_payout">("stablecoin")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const velocityPath = userId
    ? `/api/admin/office/users/${userId}/velocity-control`
    : `/api/admin/office/businesses/${businessId}/velocity-control`
  const overridePath = userId
    ? `/api/admin/office/users/${userId}/send-limit-override`
    : `/api/admin/office/businesses/${businessId}/send-limit-override`

  async function liftVelocity() {
    setBusy(true)
    setMessage(null)
    try {
      const r = await officeFetch(velocityPath, { method: "DELETE" })
      const d = (await r.json()) as { error?: string; lifted?: boolean }
      if (!r.ok) throw new Error(d.error || "Failed to lift velocity control")
      setMessage(d.lifted ? "Velocity control lifted." : "No active velocity control.")
      onChanged?.()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  async function setOverride() {
    setBusy(true)
    setMessage(null)
    try {
      const r = await officeFetch(overridePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rail, dailyMaxUsd: Number(dailyMaxUsd), reason: "Office override" }),
      })
      const d = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(d.error || "Failed to set override")
      setMessage("Daily limit override saved.")
      onChanged?.()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  async function clearOverride() {
    setBusy(true)
    setMessage(null)
    try {
      const r = await officeFetch(`${overridePath}?rail=${rail}`, { method: "DELETE" })
      const d = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(d.error || "Failed to clear override")
      setMessage("Daily limit override cleared.")
      onChanged?.()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <OfficeSection title="Outbound" divide={false}>
      {velocityLimitActive ? (
        <p className="text-sm text-muted-foreground">
          {WALLET_SEND_COMPLIANCE_STATUS_LABEL}
          {velocityMode ? ` · ${velocityMode}` : ""}
          {velocityTriggerReason ? ` · ${velocityTriggerReason}` : ""}
          {velocityMaxSendUsd != null ? ` · cap $${velocityMaxSendUsd}` : ""}
          {velocitySentUsd != null ? ` · sent $${velocitySentUsd}` : ""}
          {velocityExpiresAt ? ` · expires ${new Date(velocityExpiresAt).toLocaleString()}` : ""}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No active velocity control.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy || !velocityLimitActive} onClick={() => void liftVelocity()}>
          Lift velocity
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Rail
          <select
            className="mt-1 block rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
            value={rail}
            onChange={(e) => setRail(e.target.value as "stablecoin" | "fiat_payout")}
          >
            <option value="stablecoin">Stablecoin</option>
            <option value="fiat_payout">Fiat payout</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Daily max USD
          <Input className="mt-1 h-8 w-28" value={dailyMaxUsd} onChange={(e) => setDailyMaxUsd(e.target.value)} />
        </label>
        <Button type="button" size="sm" disabled={busy} onClick={() => void setOverride()}>
          Set override
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void clearOverride()}>
          Clear override
        </Button>
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </OfficeSection>
  )
}
