/** @see https://docs.yellowcard.engineering/docs/payment-reasons-api */
export const YC_PAYMENT_REASONS = [
  "gift",
  "bills",
  "groceries",
  "travel",
  "health",
  "entertainment",
  "housing",
  "school-fees",
  "other",
] as const

export type YcPaymentReason = (typeof YC_PAYMENT_REASONS)[number]

export const DEFAULT_YC_PAYMENT_REASON: YcPaymentReason = "other"

const YC_PAYMENT_REASON_SET = new Set<string>(YC_PAYMENT_REASONS)

function normalizeReasonToken(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ")
}

/** Map Easner/Noah purpose text or YC slug → valid YC payment reason. */
export function resolveYcPaymentReason(input?: string | null): YcPaymentReason {
  const raw = normalizeReasonToken(String(input ?? ""))
  if (!raw) return DEFAULT_YC_PAYMENT_REASON

  for (const reason of YC_PAYMENT_REASONS) {
    const canonical = reason.replace(/-/g, " ")
    if (raw === reason || raw === canonical) return reason
  }

  if (/\b(school|education|tuition)\b/.test(raw)) return "school-fees"
  if (/\b(health|medical|hospital)\b/.test(raw)) return "health"
  if (/\b(travel|flight|hotel)\b/.test(raw)) return "travel"
  if (/\b(gift|donation)\b/.test(raw)) return "gift"
  if (/\b(bill|utility|utilities)\b/.test(raw)) return "bills"
  if (/\b(housing|rent|mortgage)\b/.test(raw)) return "housing"
  if (/\b(grocer|food|market)\b/.test(raw)) return "groceries"
  if (/\b(entertain)\b/.test(raw)) return "entertainment"

  return DEFAULT_YC_PAYMENT_REASON
}

export function isYcPaymentReason(value: string): value is YcPaymentReason {
  return YC_PAYMENT_REASON_SET.has(value)
}
