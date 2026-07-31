"use client"

import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CountryFlag } from "@/components/flags"
import { CryptoAssetIcon } from "@/components/platform-control/crypto-asset-icon"
import {
  processingFeeScheduleApi,
  type ProcessingFeeScheduleRow,
  type ProcessingFeeScheduleScope,
} from "@/lib/processing-fee-schedule-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeProcessingFeeSchedule } from "@/hooks/queries"
import { Loader2 } from "lucide-react"

const DEFAULT_BPS = 100

type EditableFeeRow = ProcessingFeeScheduleRow & { _key: string }

export type ProcessingFeePricingDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: ProcessingFeeScheduleScope
  title: string
  /** Pre-built rows — opens instantly without fetching (fiat tab pattern). */
  initialRows?: ProcessingFeeScheduleRow[]
}

function rowKey(row: ProcessingFeeScheduleRow): string {
  if (row.scope === "crypto") return row.asset_code ?? ""
  return `${row.country_code}:${row.currency_code}`
}

function normalizeBpsInput(value: string): number {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_BPS
  return n
}

export function ProcessingFeePricingDialog({
  open,
  onOpenChange,
  scope,
  title,
  initialRows,
}: ProcessingFeePricingDialogProps) {
  const queryClient = useQueryClient()
  const useRemoteCatalog = initialRows === undefined
  const feesQuery = useOfficeProcessingFeeSchedule(useRemoteCatalog && open ? scope : null)
  const [draft, setDraft] = useState<EditableFeeRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const source = initialRows ?? feesQuery.data
    if (!source) return
    setDraft(
      source.map((row) => ({
        ...row,
        _key: rowKey(row),
      })),
    )
  }, [open, initialRows, feesQuery.data])

  const updateDraft = useCallback((key: string, patch: Partial<EditableFeeRow>) => {
    setDraft((prev) => prev.map((row) => (row._key === key ? { ...row, ...patch } : row)))
  }, [])

  const resetAllToDefault = useCallback(() => {
    setDraft((prev) =>
      prev.map((row) => ({
        ...row,
        pay_in_bps: DEFAULT_BPS,
        pay_out_bps: DEFAULT_BPS,
        cross_border_bps: DEFAULT_BPS,
      })),
    )
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await processingFeeScheduleApi.upsert(
        draft.map(({ _key: _unused, id: _id, country_name: _cn, currency_name: _cur, asset_name: _an, updated_at: _ua, ...row }) => row),
      )
      await queryClient.invalidateQueries({ queryKey: officeKeys.processingFeeSchedule(scope) })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const loading = useRemoteCatalog && feesQuery.isPending && draft.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="border-b pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>100 bps = 1% · applied at quote time</DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {useRemoteCatalog && feesQuery.error ? (
          <p className="text-sm text-destructive">
            {feesQuery.error instanceof Error ? feesQuery.error.message : "Failed to load fees"}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={resetAllToDefault} disabled={draft.length === 0}>
            Reset all to 100 bps
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : draft.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No destinations for this scope.</p>
          ) : scope === "crypto" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead className="w-[120px]">Pay-in (bps)</TableHead>
                  <TableHead className="w-[120px]">Pay-out (bps)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.map((row) => (
                  <TableRow key={row._key}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CryptoAssetIcon code={row.asset_code ?? ""} />
                        <span className="font-medium">{row.asset_name ?? row.asset_code}</span>
                        <span className="text-xs font-mono text-muted-foreground">{row.asset_code}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={row.pay_in_bps}
                        onChange={(e) =>
                          updateDraft(row._key, { pay_in_bps: normalizeBpsInput(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={row.pay_out_bps}
                        onChange={(e) =>
                          updateDraft(row._key, { pay_out_bps: normalizeBpsInput(e.target.value) })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead className="w-[100px]">Currency</TableHead>
                  <TableHead className="w-[120px]">Pay-in (bps)</TableHead>
                  <TableHead className="w-[120px]">Pay-out (bps)</TableHead>
                  <TableHead className="w-[140px]">Cross-border (bps)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.map((row) => (
                  <TableRow key={row._key}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CountryFlag code={row.country_code ?? ""} size={18} />
                        <span className="font-medium">{row.country_name ?? row.country_code}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{row.currency_code}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={row.pay_in_bps}
                        onChange={(e) =>
                          updateDraft(row._key, { pay_in_bps: normalizeBpsInput(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={row.pay_out_bps}
                        onChange={(e) =>
                          updateDraft(row._key, { pay_out_bps: normalizeBpsInput(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={row.cross_border_bps}
                        onChange={(e) =>
                          updateDraft(row._key, {
                            cross_border_bps: normalizeBpsInput(e.target.value),
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || draft.length === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
