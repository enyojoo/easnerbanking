const PLACEHOLDER_REJECTION_MESSAGES = new Set([
  "Verification declined for this region.",
  "Verification was declined. Review your documents and details, then try again or contact support if you need help.",
])

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function entityRejectionDetail(entity: Record<string, unknown>): string | null {
  const rejectionData = entity.RejectionData ?? entity.rejectionData
  if (rejectionData && typeof rejectionData === "object") {
    const rd = rejectionData as Record<string, unknown>
    const publicComment = readTrimmedString(rd.PublicComment ?? rd.publicComment)
    if (publicComment) return publicComment
  }

  return (
    readTrimmedString(entity.DeclinedReason) ??
    readTrimmedString(entity.Reason) ??
    readTrimmedString(entity.reason) ??
    readTrimmedString(entity.Comments) ??
    readTrimmedString(entity.comments) ??
    readTrimmedString(entity.Message) ??
    readTrimmedString(entity.message)
  )
}

function entityRejectType(entity: Record<string, unknown>): string | null {
  const rejectionData = entity.RejectionData ?? entity.rejectionData
  if (!rejectionData || typeof rejectionData !== "object") return null
  const rd = rejectionData as Record<string, unknown>
  return readTrimmedString(rd.RejectType ?? rd.rejectType)
}

/** True when stored reasons are generic fallbacks, not Noah-provided detail. */
export function isPlaceholderNoahRejectionReasons(reasons: unknown[] | null | undefined): boolean {
  if (!reasons?.length) return true
  return reasons.every((item) => {
    if (typeof item === "string") return PLACEHOLDER_REJECTION_MESSAGES.has(item.trim())
    if (!item || typeof item !== "object") return true
    const o = item as Record<string, unknown>
    const message = readTrimmedString(o.message)
    const reason = readTrimmedString(o.reason)
    const detail = reason ?? message
    if (!detail) return true
    return PLACEHOLDER_REJECTION_MESSAGES.has(detail)
  })
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
    if (text) reasons.push({ message: text })
  }

  const pushCollection = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.trim()) {
          reasons.push({ message: item.trim() })
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
        const detail = entityRejectionDetail(entity)
        if (!detail) continue
        const rejectType = entityRejectType(entity)
        reasons.push({
          entity: entity.Entity ?? entity.entity ?? null,
          status: entity.Status ?? entity.status ?? "Declined",
          reason: detail,
          message: detail,
          ...(rejectType ? { rejectType } : {}),
        })
      }
    }
  }

  if (reasons.length === 0) {
    return [
      {
        message:
          "Verification was declined. Review your documents and details, then try again or contact support if you need help.",
      },
    ]
  }

  return reasons
}

/** Human-readable copy for web + mobile UI. */
export function formatNoahRejectionReasonsText(raw: unknown): string {
  if (raw == null) return ""
  if (typeof raw === "string" && raw.trim()) return raw.trim()

  const lines = new Set<string>()
  const visit = (item: unknown) => {
    if (typeof item === "string" && item.trim()) {
      lines.add(item.trim())
      return
    }
    if (!item || typeof item !== "object") return
    const o = item as Record<string, unknown>
    for (const key of ["message", "reason", "detail", "Description", "description"]) {
      const v = o[key]
      if (typeof v === "string" && v.trim()) lines.add(v.trim())
    }
    const entity = o.entity ?? o.Entity
    const reason = o.reason ?? o.message
    if (entity && reason && typeof reason === "string") {
      lines.add(`${String(entity)}: ${reason.trim()}`)
    }
  }

  if (Array.isArray(raw)) {
    for (const item of raw) visit(item)
  } else {
    visit(raw)
  }

  return Array.from(lines).join(". ")
}
