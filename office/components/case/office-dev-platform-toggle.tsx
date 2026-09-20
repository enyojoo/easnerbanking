"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import type { OfficeBusinessRow } from "@/lib/case/types"

export function OfficeDevPlatformToggle({
  businessId,
  enabled,
}: {
  businessId: string
  enabled: boolean
}) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const checked = Boolean(enabled)

  async function persist(next: boolean) {
    const previous = queryClient.getQueryData<OfficeBusinessRow[]>(officeKeys.businesses())
    queryClient.setQueryData<OfficeBusinessRow[]>(officeKeys.businesses(), (rows) =>
      (rows ?? []).map((row) =>
        row.id === businessId ? { ...row, dev_platform_enabled: next } : row,
      ),
    )
    setBusy(true)
    try {
      const r = await officeFetch(`/api/admin/office/businesses/${businessId}/dev-platform`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: next }),
      })
      const d = (await r.json().catch(() => ({}))) as { error?: string; enabled?: boolean }
      if (!r.ok) throw new Error(d.error || "Failed to update Dev Platform")
      toast.success(next ? "Dev Platform enabled." : "Dev Platform disabled.")
      void queryClient.invalidateQueries({ queryKey: officeKeys.businesses() })
    } catch (e) {
      if (previous) queryClient.setQueryData(officeKeys.businesses(), previous)
      toast.error(e instanceof Error ? e.message : "Failed to update Dev Platform")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/70 bg-background px-3 py-3">
      <div className="min-w-0">
        <Label htmlFor="enable-dev-platform" className="text-sm font-medium">
          Dev Platform
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Unlocks Checkout, Developers, and the product switcher. Default off.
        </p>
      </div>
      <Switch
        id="enable-dev-platform"
        checked={checked}
        disabled={busy}
        onCheckedChange={(value) => {
          void persist(value)
        }}
      />
    </div>
  )
}
