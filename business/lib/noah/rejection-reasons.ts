/**
 * Noah decline payload ingest + thin re-exports for business app.
 */

import {
  isNoahPlaceholderRejectionText,
  isPlaceholderNoahRejectionReasons,
  NOAH_PLACEHOLDER_REJECTION_MESSAGES,
  formatNoahRejectionReasonsText,
} from "@easner/shared"

export {
  isPlaceholderNoahRejectionReasons,
  formatNoahRejectionReasonsText,
  getNoahRejectionDisplay,
  canResubmitNoahVerification,
  NOAH_VERIFICATION_IN_REVIEW_COPY,
  NOAH_FINAL_REJECTION_USER_MESSAGE,
} from "@easner/shared"

const PLACEHOLDER_REJECTION_MESSAGES = NOAH_PLACEHOLDER_REJECTION_MESSAGES

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseRejectLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)
}

function entityRejectType(entity: Record<string, unknown>): string | null {
  const rejectionData = entity.RejectionData ?? entity.rejectionData
  if (!rejectionData || typeof rejectionData !== "object") return null
  const rd = rejectionData as Record<string, unknown>
  return readTrimmedString(rd.RejectType ?? rd.rejectType)
}

function entityRejectionPayload(entity: Record<string, unknown>): {
  rejectType: string | null
  rejectLabels: string[]
  publicComment: string | null
} {
  const rejectionData = entity.RejectionData ?? entity.rejectionData
  if (!rejectionData || typeof rejectionData !== "object") {
    return { rejectType: null, rejectLabels: [], publicComment: null }
  }
  const rd = rejectionData as Record<string, unknown>
  return {
    rejectType: readTrimmedString(rd.RejectType ?? rd.rejectType),
    rejectLabels: parseRejectLabels(rd.RejectLabels ?? rd.rejectLabels ?? rd.Label ?? rd.label),
    publicComment: readTrimmedString(rd.PublicComment ?? rd.publicComment),
  }
}

/** Prefer richer webhook detail over later GET payloads that omit PublicComment. */
export function pickNoahRejectionReasonsToStore(
  existing: unknown[] | null | undefined,
  incoming: unknown[] | null | undefined,
): unknown[] | null {
  if (!incoming?.length) return existing?.length ? existing : null
  if (!existing?.length) return incoming
  if (isPlaceholderNoahRejectionReasons(incoming) && !isPlaceholderNoahRejectionReasons(existing)) {
    return existing
  }
  if (!isPlaceholderNoahRejectionReasons(incoming)) return incoming
  return existing
}

/** Normalize Noah decline payloads into JSON we store on users / businesses. */
export function extractNoahRejectionReasons(customer: Record<string, unknown>): unknown[] {
  const reasons: unknown[] = []

  const pushScalar = (v: unknown) => {
    const text = readTrimmedString(v)
    if (text && !isNoahPlaceholderRejectionText(text)) reasons.push({ message: text })
  }

  const pushCollection = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.trim()) {
          if (!isNoahPlaceholderRejectionText(item)) reasons.push({ message: item.trim() })
        } else if (item && typeof item === "object") {
          reasons.push(item)
        }
      }
    } else if (v && typeof v === "object") {
      reasons.push(v)
    }
  }

  pushCollection(customer.RejectionReasons ?? customer.rejectionReasons)
  pushScalar(customer.DeclinedReason ?? customer.declinedReason ?? customer.RejectionReason ?? customer.rejectionReason)

  const verification = customer.Verification ?? customer.verification
  if (verification && typeof verification === "object") {
    const v = verification as Record<string, unknown>
    pushCollection(v.RejectionReasons ?? v.rejectionReasons)
    pushScalar(v.DeclinedReason ?? v.declinedReason ?? v.Reason ?? v.reason)
  }

  const verifications = customer.Verifications ?? customer.verifications
  if (verifications && typeof verifications === "object" && !Array.isArray(verifications)) {
    const root = verifications as Record<string, unknown>
    pushCollection(root.RejectionReasons ?? root.rejectionReasons)
    pushScalar(root.DeclinedReason ?? root.declinedReason)

    const entities = root.EntityVerifications ?? root.entityVerifications
    if (Array.isArray(entities)) {
      for (const raw of entities) {
        if (!raw || typeof raw !== "object") continue
        const entity = raw as Record<string, unknown>
        const status = String(entity.Status ?? entity.status ?? "").toLowerCase()
        if (!status.includes("declin") && !status.includes("reject")) continue

        const { rejectType, rejectLabels, publicComment } = entityRejectionPayload(entity)
        const rejectTypeNorm = rejectType?.toLowerCase()

        if (rejectTypeNorm === "final") {
          reasons.push({
            entity: entity.Entity ?? entity.entity ?? null,
            status: entity.Status ?? entity.status ?? "Declined",
            rejectType: "Final",
            ...(rejectLabels.length ? { rejectLabels } : {}),
          })
          continue
        }

        const detail = publicComment
        if (detail && isNoahPlaceholderRejectionText(detail)) continue

        if (!detail && rejectLabels.length === 0 && !rejectType) continue

        reasons.push({
          entity: entity.Entity ?? entity.entity ?? null,
          status: entity.Status ?? entity.status ?? "Declined",
          ...(rejectType ? { rejectType } : { rejectType: "Retry" }),
          ...(rejectLabels.length ? { rejectLabels } : {}),
          ...(publicComment ? { publicComment, reason: publicComment, message: publicComment } : {}),
        })
      }
    }
  }

  if (reasons.length === 0) {
    return []
  }

  return reasons
}

export { PLACEHOLDER_REJECTION_MESSAGES }
