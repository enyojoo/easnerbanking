import {
  getNoahRejectionDisplay,
  type NoahRejectionDisplay,
  type StoredNoahRejectionReason,
} from "./noah-rejection"
import { isGridMachineRejectionCode } from "./grid-kyb-form"

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseRejectLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)
}

function pushUniqueMessage(out: StoredNoahRejectionReason[], message: string, rejectType?: string | null) {
  const trimmed = message.trim()
  if (!trimmed) return
  if (out.some((r) => (r.message ?? r.reason ?? r.publicComment) === trimmed)) return
  out.push({
    rejectType: rejectType === "Final" ? "Final" : rejectType === "Retry" ? "Retry" : null,
    publicComment: trimmed,
    message: trimmed,
    reason: trimmed,
  })
}

function collectFromVerificationErrors(errors: unknown, out: StoredNoahRejectionReason[]) {
  if (!Array.isArray(errors)) return
  for (const item of errors) {
    if (typeof item === "string") {
      if (isGridMachineRejectionCode(item)) continue
      pushUniqueMessage(out, item, "Retry")
      continue
    }
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const reason = readTrimmedString(o.reason ?? o.message ?? o.detail)
    if (!reason || isGridMachineRejectionCode(reason)) continue
    pushUniqueMessage(out, reason, "Retry")
  }
}

function collectFromObject(node: unknown, out: StoredNoahRejectionReason[], depth: number) {
  if (depth > 5 || node == null) return
  if (typeof node === "string") {
    pushUniqueMessage(out, node, "Retry")
    return
  }
  if (!node || typeof node !== "object") return
  const o = node as Record<string, unknown>

  const rejectType = readTrimmedString(o.rejectType ?? o.RejectType)
  const rejectLabels = parseRejectLabels(o.rejectLabels ?? o.RejectLabels ?? o.labels)
  if (rejectLabels.length) {
    out.push({
      rejectType: rejectType === "Final" ? "Final" : "Retry",
      rejectLabels,
      message: rejectLabels.join(", "),
    })
  }

  for (const key of [
    "publicComment",
    "PublicComment",
    "moderationComment",
    "clientComment",
    "rejectionReason",
    "failureReason",
    "reviewAnswer",
    "reviewResult",
    "comment",
    "message",
    "reason",
  ]) {
    const text = readTrimmedString(o[key])
    if (text) pushUniqueMessage(out, text, rejectType)
  }

  collectFromVerificationErrors(o.errors, out)
  collectFromVerificationErrors(o.verificationErrors, out)

  for (const key of ["review", "verification", "kyc", "kyb", "sumsub", "businessInfo"]) {
    if (key in o) collectFromObject(o[key], out, depth + 1)
  }
}

/** Map Grid KYB/KYC customer payload → stored rejection reasons (Noah-compatible shape). */
export function extractGridCustomerRejectionReasons(
  customer: Record<string, unknown>,
  gridStatus?: string | null,
): StoredNoahRejectionReason[] {
  const out: StoredNoahRejectionReason[] = []
  collectFromObject(customer, out, 0)

  const status = String(gridStatus ?? customer.kybStatus ?? customer.kycStatus ?? "")
    .trim()
    .toUpperCase()

  if (status === "HOLD" && !out.length) {
    out.push({
      rejectType: "Retry",
      message: "Verification is on hold while we review your submission.",
      reason: "Verification is on hold while we review your submission.",
    })
  }

  if (status === "REJECTED" && !out.length) {
    out.push({
      rejectType: "Retry",
      message: "Verification was declined. Review your documents and details, then try again.",
      reason: "Verification was declined. Review your documents and details, then try again.",
    })
  }

  if (status === "HOLD") {
    for (const row of out) {
      if (row.rejectType !== "Final") row.rejectType = "Retry"
    }
  }

  return out
}

/** Unwrap legacy `{ gridStatus, raw }` envelope or pass through stored arrays. */
export function normalizeVerificationRejectionReasons(raw: unknown): unknown {
  if (raw == null) return raw
  if (Array.isArray(raw)) return raw

  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>
    const nested = o.raw
    if (nested && typeof nested === "object" && ("gridStatus" in o || "raw" in o)) {
      const extracted = extractGridCustomerRejectionReasons(
        nested as Record<string, unknown>,
        readTrimmedString(o.gridStatus),
      )
      return extracted.length ? extracted : raw
    }
  }

  return raw
}

export function getVerificationRejectionDisplay(raw: unknown): NoahRejectionDisplay {
  return getNoahRejectionDisplay(normalizeVerificationRejectionReasons(raw))
}

export function canResubmitVerification(raw: unknown): boolean {
  return getVerificationRejectionDisplay(raw).canResubmit
}
