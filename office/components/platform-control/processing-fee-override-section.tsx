"use client"

import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
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

function formatBpsSummary(value: number | null | undefined): string {
  if (value == null) return "Schedule default"
  return `${value} bps`
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-gray-600">{label}</span>
      <div className="min-w-0 break-all text-right text-gray-900">{children}</div>
    </div>
  )
}

function ReadOnlySummary({ override }: { override: ProcessingFeeOverrideRow | null }) {
  if (!override) {
    return (
      <div className="mt-2 space-y-2">
        <DetailRow label="Source">Corridor schedule</DetailRow>
        <DetailRow label="Pay-in">Schedule default</DetailRow>
        <DetailRow label="Pay-out">Schedule default</DetailRow>
        <DetailRow label="Cross-border">Schedule default</DetailRow>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      <DetailRow label="Source">Custom override</DetailRow>
      <DetailRow label="Pay-in">{formatBpsSummary(override.pay_in_bps)}</DetailRow>
      <DetailRow label="Pay-out">{formatBpsSummary(override.pay_out_bps)}</DetailRow>
      <DetailRow label="Cross-border">{formatBpsSummary(override.cross_border_bps)}</DetailRow>
      {override.reason?.trim() ? <DetailRow label="Reason">{override.reason.trim()}</DetailRow> : null}
    </div>
  )
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
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  const syncFromOverride = useCallback((row: ProcessingFeeOverrideRow | null) => {
    if (!row) {
      setMode("schedule")
      setDraft(emptyDraft())
      return
    }
    setMode("custom")
    setDraft(draftFromOverride(row))
  }, [])

  useEffect(() => {
    if (overrideQuery.isLoading || isEditing) return
    syncFromOverride(override)
  }, [override, overrideQuery.isLoading, isEditing, syncFromOverride])

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: officeKeys.processingFeeOverride(subjectType, subjectId),
    })
  }, [queryClient, subjectType, subjectId])

  const startEditing = () => {
    syncFromOverride(override)
    setFeedback(null)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    syncFromOverride(override)
    setFeedback(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      if (mode === "schedule") {
        await processingFeeOverridesApi.remove(subjectType, subjectId)
        setDraft(emptyDraft())
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
      await invalidate()
      setIsEditing(false)
    } catch (e) {
      setFeedback({
        ok: false,
        message: e instanceof Error ? e.message : "Failed to save processing fee override",
      })
    } finally {
      setSaving(false)
    }
  }

  const canEdit = !setupRequired && !loadError && !overrideQuery.isLoading

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-gray-900">Easner processing fees</label>
        {canEdit && !isEditing ? (
          <Button type="button" size="sm" variant="outline" onClick={startEditing}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Blank direction fields fall through to the corridor schedule. Enter 0 to waive that direction.
      </p>

      {overrideQuery.isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      ) : setupRequired || loadError ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {setupRequired
            ? "Fee overrides are not enabled yet. Apply migration 20260731130000_processing_fee_overrides.sql on Supabase, then redeploy."
            : loadError}
        </p>
      ) : !isEditing ? (
        <ReadOnlySummary override={override} />
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`fee-mode-${subjectType}-${subjectId}`}
                checked={mode === "schedule"}
                onChange={() => {
                  setMode("schedule")
                  setFeedback(null)
                }}
              />
              Use corridor schedule
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`fee-mode-${subjectType}-${subjectId}`}
                checked={mode === "custom"}
                onChange={() => {
                  setMode("custom")
                  setFeedback(null)
                }}
              />
              Custom
            </label>
          </div>

          {mode === "custom" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={`pay-in-${subjectId}`}>Pay-in (bps)</Label>
                <Input
                  id={`pay-in-${subjectId}`}
                  inputMode="numeric"
                  placeholder="schedule"
                  value={draft.payIn}
                  onChange={(e) => setDraft((prev) => ({ ...prev, payIn: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`pay-out-${subjectId}`}>Pay-out (bps)</Label>
                <Input
                  id={`pay-out-${subjectId}`}
                  inputMode="numeric"
                  placeholder="schedule"
                  value={draft.payOut}
                  onChange={(e) => setDraft((prev) => ({ ...prev, payOut: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`cross-border-${subjectId}`}>Cross-border (bps)</Label>
                <Input
                  id={`cross-border-${subjectId}`}
                  inputMode="numeric"
                  placeholder="schedule"
                  value={draft.crossBorder}
                  onChange={(e) => setDraft((prev) => ({ ...prev, crossBorder: e.target.value }))}
                />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor={`reason-${subjectId}`}>Reason</Label>
                <Input
                  id={`reason-${subjectId}`}
                  placeholder="Optional note for ops / audit"
                  value={draft.reason}
                  onChange={(e) => setDraft((prev) => ({ ...prev, reason: e.target.value }))}
                />
              </div>
            </div>
          ) : null}

          {feedback ? (
            <p className="rounded-xl border border-[hsl(var(--destructive)/0.25)] bg-[hsl(var(--destructive)/0.08)] px-3 py-2 text-sm text-destructive">
              {feedback.message}
            </p>
          ) : null}

          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={cancelEditing} disabled={saving}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="button" className="flex-1" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
