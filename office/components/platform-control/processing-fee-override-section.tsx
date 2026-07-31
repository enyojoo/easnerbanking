"use client"

import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  processingFeeOverridesApi,
  type ProcessingFeeOverrideSubjectType,
} from "@/lib/processing-fee-overrides-api"
import { useOfficeProcessingFeeOverride } from "@/hooks/queries/use-office-processing-fee-override"
import { officeKeys } from "@/lib/query/keys"
import { Loader2 } from "lucide-react"

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
  const [mode, setMode] = useState<FeeMode>("schedule")
  const [draft, setDraft] = useState<DraftState>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    if (!overrideQuery.data && !overrideQuery.isLoading) {
      setMode("schedule")
      setDraft(emptyDraft())
      return
    }
    if (overrideQuery.data) {
      setMode("custom")
      setDraft(draftFromOverride(overrideQuery.data))
    }
  }, [overrideQuery.data, overrideQuery.isLoading])

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: officeKeys.processingFeeOverride(subjectType, subjectId),
    })
  }, [queryClient, subjectType, subjectId])

  const handleSave = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      if (mode === "schedule") {
        await processingFeeOverridesApi.remove(subjectType, subjectId)
        setDraft(emptyDraft())
        await invalidate()
        setFeedback({ ok: true, message: "Using corridor schedule for all directions." })
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
      setFeedback({ ok: true, message: "Processing fee override saved." })
    } catch (e) {
      setFeedback({
        ok: false,
        message: e instanceof Error ? e.message : "Failed to save processing fee override",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <label className="text-sm font-medium text-gray-900">Easner processing fees</label>
      <p className="mt-1 text-xs text-muted-foreground">
        Blank direction fields fall through to the corridor schedule. Enter 0 to waive that direction.
      </p>

      {overrideQuery.isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
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
            <p
              className={`text-sm rounded-xl border px-3 py-2 ${
                feedback.ok
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-[hsl(var(--destructive)/0.25)] bg-[hsl(var(--destructive)/0.08)] text-destructive"
              }`}
            >
              {feedback.message}
            </p>
          ) : null}

          <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save processing fees"
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
