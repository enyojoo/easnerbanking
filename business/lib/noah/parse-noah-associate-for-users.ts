/**
 * Parse Noah Business Customer Associates[] → representative person fields for owner users row.
 */

import { parseNoahCustomerForUsers, type ParsedNoahCustomerForUsers } from "./parse-noah-customer-for-users"

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function relationshipTypes(associate: Record<string, unknown>): string[] {
  const raw = associate.RelationshipTypes ?? associate.relationshipTypes ?? associate.Roles
  if (!Array.isArray(raw)) return []
  return raw.map((r) => String(r).toLowerCase())
}

function ownershipPct(associate: Record<string, unknown>): number {
  const raw =
    associate.OwnershipPercentage ??
    associate.ownershipPercentage ??
    associate.OwnershipPercent ??
    associate.ownershipPercent
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function associateEmail(associate: Record<string, unknown>): string | null {
  const e = associate.Email ?? associate.email
  return typeof e === "string" && e.trim() ? e.trim().toLowerCase() : null
}

/**
 * Pick Representative matching owner email when present; else highest UBO %; else first associate.
 */
export function pickNoahBusinessRepresentative(
  customer: Record<string, unknown>,
  options?: { ownerEmail?: string | null },
): Record<string, unknown> | null {
  const raw = customer.Associates ?? customer.associates
  if (!Array.isArray(raw) || raw.length === 0) return null

  const associates = raw
    .map((a) => asRecord(a))
    .filter((a): a is Record<string, unknown> => Boolean(a))
  if (associates.length === 0) return null

  const ownerEmail = options?.ownerEmail?.trim().toLowerCase() || null
  if (ownerEmail) {
    const byEmail = associates.find((a) => associateEmail(a) === ownerEmail)
    if (byEmail) return byEmail
  }

  const representatives = associates.filter((a) =>
    relationshipTypes(a).some((t) => t.includes("representative") || t === "rep"),
  )
  if (representatives.length === 1) return representatives[0]
  if (representatives.length > 1) {
    return [...representatives].sort((a, b) => ownershipPct(b) - ownershipPct(a))[0]
  }

  const ubos = associates.filter((a) =>
    relationshipTypes(a).some((t) => t.includes("ubo") || t.includes("beneficial")),
  )
  if (ubos.length > 0) {
    return [...ubos].sort((a, b) => ownershipPct(b) - ownershipPct(a))[0]
  }

  return associates[0]
}

/**
 * Map a Noah Associate (or flattened person) into users KYC columns via parseNoahCustomerForUsers.
 */
export function parseNoahAssociateForUsers(
  associate: Record<string, unknown>,
  options?: { occurredAt?: string },
): ParsedNoahCustomerForUsers {
  return parseNoahCustomerForUsers(associate, options)
}

/**
 * From Business customer payload: prefer top-level Identities; else Associates[] representative.
 */
export function parseNoahBusinessPersonForOwnerUsers(
  customer: Record<string, unknown>,
  options?: { occurredAt?: string; ownerEmail?: string | null },
): ParsedNoahCustomerForUsers {
  const topLevel = parseNoahCustomerForUsers(customer, { occurredAt: options?.occurredAt })
  // If top-level Identities produced an id type, use that
  if (topLevel.kyc_id_type || topLevel.kyc_id_number) {
    return topLevel
  }

  const rep = pickNoahBusinessRepresentative(customer, { ownerEmail: options?.ownerEmail })
  if (!rep) {
    // Still return name/DOB from entity root if any
    return topLevel
  }
  return parseNoahAssociateForUsers(rep, { occurredAt: options?.occurredAt })
}
