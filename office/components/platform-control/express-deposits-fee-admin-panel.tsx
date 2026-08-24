"use client"

import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { processingFeeScheduleApi } from "@/lib/processing-fee-schedule-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeProcessingFeeSchedule } from "@/hooks/queries"

function normalizeBps(value: string): number {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export function ExpressDepositsFeeAdminPanel() {
  const queryClient = useQueryClient()
  const feesQuery = useOfficeProcessingFeeSchedule("express_deposits")
  const [payInBps, setPayInBps] = useState("0")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const row = feesQuery.data?.[0]
    if (row) setPayInBps(String(row.pay_in_bps ?? 0))
  }, [feesQuery.data])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const bps = normalizeBps(payInBps)
      await processingFeeScheduleApi.upsert([
        {
          scope: "express_deposits",
          pay_in_bps: bps,
          pay_out_bps: 0,
          cross_border_bps: 0,
        },
      ])
      await queryClient.invalidateQueries({ queryKey: officeKeys.processingFeeSchedule("express_deposits") })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }, [payInBps, queryClient])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Express deposits fees</CardTitle>
        <CardDescription>
          Buyer-pays pay-in processing fee (basis points on USD credit). Launch default is 0 bps.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feesQuery.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="express-pay-in-bps">Pay-in bps</Label>
              <Input
                id="express-pay-in-bps"
                type="number"
                min={0}
                value={payInBps}
                onChange={(e) => setPayInBps(e.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
