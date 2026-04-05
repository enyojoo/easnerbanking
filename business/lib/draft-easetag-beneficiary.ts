import type { Beneficiary } from "@/lib/recipient-types"

/** Prefix for Easetag recipients chosen from send-hub search before DB persist (parity with mobile). */
export const DRAFT_EASENET_ID_PREFIX = "draft_easenet:"

export function isDraftEasetagBeneficiary(id: string): boolean {
  return String(id || "").startsWith(DRAFT_EASENET_ID_PREFIX)
}

export function buildDraftEasetagBeneficiary(params: {
  easetag: string
  fullName: string
  avatarUrl: string | null
}): Beneficiary {
  const tag = params.easetag.trim().replace(/^@+/, "").toLowerCase()
  const now = new Date().toISOString()
  return {
    id: `${DRAFT_EASENET_ID_PREFIX}${tag}`,
    countryCode: "US",
    payeeEasetag: tag,
    avatarUrl: params.avatarUrl ?? undefined,
    name: params.fullName.trim() || tag,
    bankName: `Easetag (@${tag})`,
    accountNumber: tag,
    fullAccountNumber: tag,
    country: "United States",
    currency: "USD",
    email: "",
    phone: "",
    createdAt: now,
    lastUsed: now,
  }
}
