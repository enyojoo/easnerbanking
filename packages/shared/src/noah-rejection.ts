/**
 * Noah KYC/KYB rejection display helpers (Final vs Retry).
 * Ingest parsing stays in business/lib/noah/rejection-reasons.ts.
 */

export type NoahRejectType = "Final" | "Retry" | string

export type StoredNoahRejectionReason = {
  rejectType?: NoahRejectType | null
  rejectLabels?: string[] | null
  publicComment?: string | null
  message?: string | null
  reason?: string | null
  entity?: string | null
  status?: string | null
}

export const NOAH_PLACEHOLDER_REJECTION_MESSAGES = new Set([
  "Verification declined for this region.",
  "Verification was declined. Review your documents and details, then try again or contact support if you need help.",
])

export const NOAH_VERIFICATION_IN_REVIEW_COPY =
  "Verification is in progress. This usually completes within 1–3 days."

export const NOAH_FINAL_REJECTION_USER_MESSAGE =
  "Verification could not be completed for this account. Please contact support if you have questions."

export const NOAH_RETRY_GENERIC_GUIDANCE =
  "Please review your documents and details, then try again."

const REJECT_LABEL_GUIDANCE: Record<string, string> = {
  BAD_PROOF_OF_IDENTITY:
    "Use a valid physical government-issued photo ID. Paper-format IDs are not accepted.",
  UNSATISFACTORY_PHOTOS:
    "Retake your photos in good lighting without glare, blur, or cropped edges.",
  DOCUMENT_PAGE_MISSING:
    "Include all required pages or sides of your document.",
  EXPIRATION_DATE: "Use a current, non-expired document.",
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function normalizeNoahRejectType(value: unknown): NoahRejectType | null {
  const s = readTrimmedString(value)
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower === "final") return "Final"
  if (lower === "retry") return "Retry"
  return s
}

export function isNoahPlaceholderRejectionText(text: string | null | undefined): boolean {
  if (!text) return true
  return NOAH_PLACEHOLDER_REJECTION_MESSAGES.has(text.trim())
}

/** True when stored reasons are generic fallbacks, not Noah-provided detail. */
export function isPlaceholderNoahRejectionReasons(reasons: unknown[] | null | undefined): boolean {
  if (!reasons?.length) return true
  return reasons.every((item) => {
    if (typeof item === "string") return isNoahPlaceholderRejectionText(item)
    if (!item || typeof item !== "object") return true
    const o = item as Record<string, unknown>
    const rejectType = normalizeNoahRejectType(o.rejectType ?? o.RejectType)
    if (rejectType === "Final") return false
    const message = readTrimmedString(o.message)
    const reason = readTrimmedString(o.reason)
    const publicComment = readTrimmedString(o.publicComment ?? o.PublicComment)
    const detail = publicComment ?? reason ?? message
    if (!detail) return rejectType !== "Retry"
    return isNoahPlaceholderRejectionText(detail)
  })
}

function parseRejectLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
}

export function normalizeStoredNoahRejectionReason(item: unknown): StoredNoahRejectionReason | null {
  if (typeof item === "string" && item.trim()) {
    if (isNoahPlaceholderRejectionText(item)) return null
    return { message: item.trim(), reason: item.trim() }
  }
  if (!item || typeof item !== "object") return null
  const o = item as Record<string, unknown>
  const rejectType = normalizeNoahRejectType(o.rejectType ?? o.RejectType)
  const rejectLabels = parseRejectLabels(o.rejectLabels ?? o.RejectLabels)
  const publicComment = readTrimmedString(o.publicComment ?? o.PublicComment)
  const message = readTrimmedString(o.message)
  const reason = readTrimmedString(o.reason)
  if (
    !rejectType &&
    rejectLabels.length === 0 &&
    !publicComment &&
    !message &&
    !reason
  ) {
    return null
  }
  if (
    rejectType !== "Final" &&
    rejectType !== "Retry" &&
    !rejectLabels.length &&
    !publicComment &&
    !message &&
    !reason
  ) {
    return null
  }
  const detail = publicComment ?? reason ?? message
  if (detail && isNoahPlaceholderRejectionText(detail) && rejectType !== "Retry") {
    if (!rejectLabels.length && !rejectType) return null
  }
  return {
    rejectType,
    rejectLabels: rejectLabels.length ? rejectLabels : null,
    publicComment,
    message,
    reason,
    entity: readTrimmedString(o.entity ?? o.Entity),
    status: readTrimmedString(o.status ?? o.Status),
  }
}

export function parseStoredNoahRejectionReasons(raw: unknown): StoredNoahRejectionReason[] {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  const out: StoredNoahRejectionReason[] = []
  for (const item of list) {
    const norm = normalizeStoredNoahRejectionReason(item)
    if (norm) out.push(norm)
  }
  return out
}

export function resolvePrimaryNoahRejectType(reasons: StoredNoahRejectionReason[]): NoahRejectType | null {
  for (const r of reasons) {
    if (r.rejectType === "Final") return "Final"
  }
  for (const r of reasons) {
    if (r.rejectType === "Retry") return "Retry"
  }
  for (const r of reasons) {
    if (r.rejectType) return r.rejectType
  }
  return null
}

export function guidanceForRejectLabel(label: string): string | null {
  const key = label.trim().toUpperCase()
  return REJECT_LABEL_GUIDANCE[key] ?? null
}

export function buildRetryGuidanceFromReasons(reasons: StoredNoahRejectionReason[]): string[] {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const r of reasons) {
    for (const label of r.rejectLabels ?? []) {
      const mapped = guidanceForRejectLabel(label)
      if (mapped && !seen.has(mapped)) {
        seen.add(mapped)
        lines.push(mapped)
      }
    }
  }
  if (lines.length) return lines
  for (const r of reasons) {
    const pc = r.publicComment?.trim()
    if (pc && !isNoahPlaceholderRejectionText(pc) && !seen.has(pc)) {
      seen.add(pc)
      lines.push(pc)
    }
  }
  if (lines.length) return lines
  return [NOAH_RETRY_GENERIC_GUIDANCE]
}

export type NoahRejectionDisplay = {
  rejectType: NoahRejectType | null
  canResubmit: boolean
  /** User-visible lines (empty for Final). */
  guidanceLines: string[]
  /** Single block for simple UI. */
  bodyText: string
  isFinal: boolean
  isRetry: boolean
}

export function getNoahRejectionDisplay(raw: unknown): NoahRejectionDisplay {
  const parsed = parseStoredNoahRejectionReasons(raw)
  const rejectType = resolvePrimaryNoahRejectType(parsed)
  const isFinal = rejectType === "Final"
  const isRetry = rejectType === "Retry" || (!isFinal && parsed.length > 0)

  if (isFinal) {
    return {
      rejectType: "Final",
      canResubmit: false,
      guidanceLines: [],
      bodyText: NOAH_FINAL_REJECTION_USER_MESSAGE,
      isFinal: true,
      isRetry: false,
    }
  }

  if (isRetry || parsed.length > 0) {
    const guidanceLines = buildRetryGuidanceFromReasons(parsed)
    return {
      rejectType: rejectType ?? "Retry",
      canResubmit: true,
      guidanceLines,
      bodyText: guidanceLines.join(" "),
      isFinal: false,
      isRetry: true,
    }
  }

  return {
    rejectType: null,
    canResubmit: true,
    guidanceLines: [],
    bodyText: "",
    isFinal: false,
    isRetry: false,
  }
}

export function canResubmitNoahVerification(raw: unknown): boolean {
  return getNoahRejectionDisplay(raw).canResubmit
}

/** @deprecated Prefer getNoahRejectionDisplay for UI. */
export function formatNoahRejectionReasonsText(raw: unknown): string {
  const display = getNoahRejectionDisplay(raw)
  if (display.isFinal) return ""
  return display.bodyText
}
