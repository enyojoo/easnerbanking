"use client"

import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  processingFeeOverridesApi,
  type ProcessingFeeOverrideRow,
  type ProcessingFeeOverrideSubjectType,
} from "@/lib/processing-fee-overrides-api"
import { useOfficeProcessingFeeOverride } from "@/hooks/queries/use-office-processing-fee-override"
import { officeKeys } from "@/lib/query/keys"
import { Edit, Loader2, Save, X } from "lucide-react"

type FeeMode = "schedule" | "custom"

type DraftState = {
  payIn: string
  payOut: string
  crossBorder: string
  reason: string
}

function emptyDraft(): DraftState {
  return { payIn: "", payOut: "", crossBorder: "", reason: "" }
}

function draftFromOverride(row: {
  pay_in_bps: number | null
  pay_out_bps: number | null
  cross_border_bps: number | null
  reason: string | null
}): DraftState {
  return {
    payIn: row.pay_in_bps == null ? "" : String(row.pay_in_bps),
    payOut: row.pay_out_bps == null ? "" : String(row.pay_out_bps),
    crossBorder: row.cross_border_bps == null ? "" : String(row.cross_border_bps),
    reason: row.reason ?? "",
  }
}

function parseNullableBpsInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("bps must be a non-negative integer or blank")
  }
  return n
}

function modeFromOverride(row: ProcessingFeeOverrideRow | null): FeeMode {
  return row ? "custom" : "schedule"
}

export type ProcessingFeeOverrideSectionProps = {
  subjectType: ProcessingFeeOverrideSubjectType
  subjectId: string
}

export function ProcessingFeeOverrideSection({
  subjectType,
  subjectId,
}: ProcessingFeeOverrideSectionProps) {
  const queryClient = useQueryClient()
  const overrideQuery = useOfficeProcessingFeeOverride(subjectType, subjectId)
  const override = overrideQuery.data?.override ?? null
  const setupRequired = overrideQuery.data?.setupRequired === true
  const loadError =
    overrideQuery.isError
      ? overrideQuery.error instanceof Error
        ? overrideQuery.error.message
        : "Failed to load processing fee override"
      : null
  const [isEditing, setIsEditing] = useState(false)
  const [mode, setMode] = useState<FeeMode>("schedule")
  const [draft, setDraft] = useState<DraftState>(emptyDraft)
  const [originalMode, setOriginalMode] = useState<FeeMode>("schedule")
  const [originalDraft, setOriginalDraft] = useState<DraftState>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyOverride = useCallback((row: ProcessingFeeOverrideRow | null) => {
    const nextMode = modeFromOverride(row)
    const nextDraft = row ? draftFromOverride(row) : emptyDraft()
    setMode(nextMode)
    setDraft(nextDraft)
    setOriginalMode(nextMode)
    setOriginalDraft(nextDraft)
  }, [])

  useEffect(() => {
    if (overrideQuery.isLoading || isEditing) return
    applyOverride(override)
  }, [override, overrideQuery.isLoading, isEditing, applyOverride])

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: officeKeys.processingFeeOverride(subjectType, subjectId),
    })
  }, [queryClient, subjectType, subjectId])

  const startEditing = () => {
    setOriginalMode(mode)
    setOriginalDraft(draft)
    setError(null)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setMode(originalMode)
    setDraft(originalDraft)
    setError(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (mode === "schedule") {
        await processingFeeOverridesApi.remove(subjectType, subjectId)
        const cleared = emptyDraft()
        setDraft(cleared)
        setOriginalMode("schedule")
        setOriginalDraft(cleared)
        await invalidate()
        setIsEditing(false)
        return
      }

      await processingFeeOverridesApi.upsert({
        subject_type: subjectType,
        subject_id: subjectId,
        pay_in_bps: parseNullableBpsInput(draft.payIn),
        pay_out_bps: parseNullableBpsInput(draft.payOut),
        cross_border_bps: parseNullableBpsInput(draft.crossBorder),
        reason: draft.reason.trim() || null,
      })
      setOriginalMode("custom")
      setOriginalDraft(draft)
      await invalidate()
      setIsEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save processing fee override")
    } finally {
      setSaving(false)
    }
  }

  const canEdit = !setupRequired && !loadError && !overrideQuery.isLoading
  const fieldsDisabled = !isEditing || mode === "schedule"
  const scheduleView = mode === "schedule" && !isEditing

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Easner processing fees</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Blank direction fields fall through to the corridor schedule. Enter 0 to waive that direction.
            </p>
          </div>
          {canEdit && !isEditing ? (
            <Button type="button" onClick={startEditing} className="shrink-0 bg-primary hover:bg-primary/90">
              <Edit className="mr-2 h-4 w-4" />
              Edit fees
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {overrideQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ) : setupRequired || loadError ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {setupRequired
              ? "Fee overrides are not enabled yet. Apply migration 20260731130000_processing_fee_overrides.sql on Supabase, then redeploy."
              : loadError}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`fee-source-${subjectId}`}>Fee source</Label>
                <Select
                  value={mode}
                  onValueChange={(value: FeeMode) => {
                    setMode(value)
                    setError(null)
                  }}
                  disabled={!isEditing}
                >
                  <SelectTrigger id={`fee-source-${subjectId}`} className="max-w-md">
                    <SelectValue placeholder="Select fee source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="schedule">Corridor schedule</SelectItem>
                    <SelectItem value="custom">Custom override</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`pay-in-${subjectId}`}>Pay-in (bps)</Label>
                <Input
                  id={`pay-in-${subjectId}`}
                  inputMode="numeric"
                  placeholder="Schedule default"
                  value={scheduleView || mode === "schedule" ? "" : draft.payIn}
                  onChange={(e) => setDraft((prev) => ({ ...prev, payIn: e.target.value }))}
                  disabled={fieldsDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`pay-out-${subjectId}`}>Pay-out (bps)</Label>
                <Input
                  id={`pay-out-${subjectId}`}
                  inputMode="numeric"
                  placeholder="Schedule default"
                  value={scheduleView || mode === "schedule" ? "" : draft.payOut}
                  onChange={(e) => setDraft((prev) => ({ ...prev, payOut: e.target.value }))}
                  disabled={fieldsDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`cross-border-${subjectId}`}>Cross-border (bps)</Label>
                <Input
                  id={`cross-border-${subjectId}`}
                  inputMode="numeric"
                  placeholder="Schedule default"
                  value={scheduleView || mode === "schedule" ? "" : draft.crossBorder}
                  onChange={(e) => setDraft((prev) => ({ ...prev, crossBorder: e.target.value }))}
                  disabled={fieldsDisabled}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`reason-${subjectId}`}>Reason</Label>
                <Input
                  id={`reason-${subjectId}`}
                  placeholder={scheduleView ? "–" : "Optional note for ops / audit"}
                  value={scheduleView || mode === "schedule" ? "" : draft.reason}
                  onChange={(e) => setDraft((prev) => ({ ...prev, reason: e.target.value }))}
                  disabled={fieldsDisabled}
                />
              </div>
            </div>

            {error ? (
              <p className="rounded-xl border border-[hsl(var(--destructive)/0.25)] bg-[hsl(var(--destructive)/0.08)] px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {isEditing ? (
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelEditing}
                  className="flex-1 bg-transparent"
                  disabled={saving}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save processing fees
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
