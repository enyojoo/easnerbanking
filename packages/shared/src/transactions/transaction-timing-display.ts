import { mapLedgerStatusToUserStatus } from "./ledger-status-display"

export type TransactionTimingRow = {
  label: string
  value: string
}

/** Payouts: ledger `created_at` (user initiated). Deposits: Noah `processing_at` (bank rail). */
export type TransactionTimingStartAnchor = "created_at" | "processing_at"

export type BuildTransactionTimingRowsInput = {
  status: string
  startedAt: string | null
  completedAt?: string | null
  failedAt?: string | null
  expectedProcessingTime?: string | null
  /** Global payout in-flight: show Expected estimate. */
  showExpectedWhileInFlight?: boolean
  /**
   * User-initiated payouts: show Started timestamp while in-flight.
   * Bank deposits: false — Processing step in lifecycle already shows that time.
   */
  showStartedWhileInFlight?: boolean
  /** Bank deposits: false — use lifecycle tracker only (no Completed in / Failed after). */
  showTerminalDuration?: boolean
}

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

function readMetaIso(meta: Record<string, unknown>, key: string): string | null {
  return pickIso(meta[key])
}

function lifecycleStepOccurredAt(
  lifecycle: Array<{ id: string; occurredAt: string | null }> | null | undefined,
  stepId: string,
): string | null {
  const step = lifecycle?.find((s) => s.id === stepId)
  if (!step?.occurredAt) return null
  const s = String(step.occurredAt).trim()
  return s || null
}

export type ResolveTransactionTimingAnchorsInput = {
  createdAt?: string | null
  startAnchor?: TransactionTimingStartAnchor
  metadata?: Record<string, unknown> | null
  webhookProcessingAt?: string | null
  webhookCompletedAt?: string | null
  webhookFailedAt?: string | null
  lifecycle?: Array<{ id: string; occurredAt: string | null }> | null
}

/** Resolves duration start/end. Payout start = `created_at`; deposit start = `processing_at`. */
export function resolveTransactionTimingAnchors(
  input: ResolveTransactionTimingAnchorsInput,
): {
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
} {
  const meta = input.metadata ?? {}
  const startAnchor = input.startAnchor ?? "created_at"
  const startedAt =
    startAnchor === "processing_at"
      ? pickIso(
          input.webhookProcessingAt,
          readMetaIso(meta, "processing_at"),
          lifecycleStepOccurredAt(input.lifecycle, "processing"),
        )
      : pickIso(input.createdAt)
  const completedAt = pickIso(
    input.webhookCompletedAt,
    readMetaIso(meta, "completed_at"),
    lifecycleStepOccurredAt(input.lifecycle, "completed"),
  )
  const failedAt = pickIso(
    input.webhookFailedAt,
    readMetaIso(meta, "failed_at"),
    readMetaIso(meta, "noah_payout_failed_at"),
    lifecycleStepOccurredAt(input.lifecycle, "failed"),
  )
  return { startedAt, completedAt, failedAt }
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (iso == null) return null
  const s = String(iso).trim()
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : null
}

/** Human-readable duration between two instants. */
export function formatTransactionDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) {
    return totalSeconds === 1 ? "1 second" : `${totalSeconds} seconds`
  }
  const totalMinutes = Math.round(ms / 60_000)
  if (totalMinutes < 60) {
    return totalMinutes === 1 ? "1 minute" : `${totalMinutes} minutes`
  }
  const totalHours = Math.round(ms / 3_600_000)
  if (totalHours < 48) {
    return totalHours === 1 ? "~1 hour" : `~${totalHours} hours`
  }
  const totalDays = Math.round(ms / 86_400_000)
  return totalDays === 1 ? "~1 day" : `~${totalDays} days`
}

function formatStartedDisplay(iso: string | null): string {
  const ms = parseIsoMs(iso)
  if (ms == null) return "—"
  const date = new Date(ms)
  const month = date.toLocaleString("en-US", { month: "short" })
  const day = date.getDate().toString().padStart(2, "0")
  const year = date.getFullYear()
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  const displayHours = hours % 12 || 12
  return `${month} ${day}, ${year} • ${displayHours}:${minutes} ${ampm}`
}

/**
 * Detail summary rows for Option A timing (Expected / Started / Completed in / Failed after).
 */
export function buildTransactionTimingRows(
  input: BuildTransactionTimingRowsInput,
): TransactionTimingRow[] {
  const userStatus = mapLedgerStatusToUserStatus(input.status)
  const startedMs = parseIsoMs(input.startedAt)
  const startedDisplay = formatStartedDisplay(input.startedAt)
  const showTerminalDuration = input.showTerminalDuration !== false

  if (userStatus === "completed" && showTerminalDuration) {
    const endMs = parseIsoMs(input.completedAt)
    if (startedMs != null && endMs != null && endMs >= startedMs) {
      return [{ label: "Completed in", value: formatTransactionDurationMs(endMs - startedMs) }]
    }
    return []
  }

  if (userStatus === "failed" && showTerminalDuration) {
    const endMs = parseIsoMs(input.failedAt)
    if (startedMs != null && endMs != null && endMs >= startedMs) {
      return [{ label: "Failed after", value: formatTransactionDurationMs(endMs - startedMs) }]
    }
    return []
  }

  const rows: TransactionTimingRow[] = []
  if (input.showExpectedWhileInFlight) {
    const expected = String(input.expectedProcessingTime ?? "").trim()
    if (expected) {
      rows.push({ label: "Expected", value: expected })
    }
  }
  if (input.showStartedWhileInFlight && startedMs != null) {
    rows.push({ label: "Started", value: startedDisplay })
  }
  return rows
}
