import { mapLedgerStatusToUserStatus } from "./ledger-status-display"

export type TransactionTimingRow = {
  label: string
  value: string
}

export type BuildTransactionTimingRowsInput = {
  status: string
  startedAt: string | null
  completedAt?: string | null
  failedAt?: string | null
  expectedProcessingTime?: string | null
  /** When true (global payout in-flight), show Expected + Started. */
  showExpectedWhileInFlight?: boolean
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

  if (userStatus === "completed") {
    const endMs = parseIsoMs(input.completedAt)
    if (startedMs != null && endMs != null && endMs >= startedMs) {
      return [{ label: "Completed in", value: formatTransactionDurationMs(endMs - startedMs) }]
    }
    if (startedMs != null) {
      return [{ label: "Started", value: startedDisplay }]
    }
    return []
  }

  if (userStatus === "failed") {
    const endMs = parseIsoMs(input.failedAt)
    if (startedMs != null && endMs != null && endMs >= startedMs) {
      return [{ label: "Failed after", value: formatTransactionDurationMs(endMs - startedMs) }]
    }
    if (startedMs != null) {
      return [{ label: "Started", value: startedDisplay }]
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
  if (startedMs != null) {
    rows.push({ label: "Started", value: startedDisplay })
  }
  return rows
}
