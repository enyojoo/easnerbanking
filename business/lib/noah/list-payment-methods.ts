import { noahFetch } from "./http"

type PmResp = { Items?: Array<Record<string, unknown>>; PageToken?: string }

type NoahPaymentMethodCapability = "PayinTo" | "PayoutFrom" | "PayoutTo"

async function fetchPaymentMethodPage(
  noahCustomerId: string,
  opts: { capability?: NoahPaymentMethodCapability; pageToken?: string },
): Promise<PmResp> {
  return noahFetch<PmResp>({
    method: "GET",
    path: "/payment-methods",
    query: {
      CustomerID: noahCustomerId,
      PageSize: 50,
      ...(opts.capability ? { Capability: opts.capability } : {}),
      ...(opts.pageToken ? { PageToken: opts.pageToken } : {}),
    },
  })
}

async function fetchPaymentMethodsPaginated(
  noahCustomerId: string,
  capability?: NoahPaymentMethodCapability,
): Promise<Record<string, unknown>[]> {
  const all: Array<Record<string, unknown>> = []
  let token: string | undefined
  for (let i = 0; i < 5; i++) {
    const data = await fetchPaymentMethodPage(noahCustomerId, { capability, pageToken: token })
    const items = data.Items ?? []
    all.push(...items)
    token = data.PageToken
    if (!token || items.length === 0) break
  }
  return all
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0)
}

/** Combine PayinTo + unfiltered PM payloads without dropping nested IssuerDetails / DisplayDetails. */
export function mergePaymentMethodRecord(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null) continue
    const prev = out[key]
    if (key === "IssuerDetails" || key === "DisplayDetails" || key === "AccountHolderDetails") {
      if (isNonEmptyRecord(prev) && isNonEmptyRecord(value)) {
        out[key] = { ...prev, ...value }
      } else if (isNonEmptyRecord(value)) {
        out[key] = value
      } else if (!isNonEmptyRecord(prev)) {
        out[key] = value
      }
      continue
    }
    if (typeof value === "string" && !value.trim() && prev != null && prev !== "") continue
    out[key] = value
  }
  return out
}

function mergePaymentMethodsById(lists: Record<string, unknown>[][]): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>()
  for (const list of lists) {
    for (const pm of list) {
      const id = String(pm.ID ?? pm.Id ?? "").trim()
      const mapKey = id || `anon-${byId.size}`
      const existing = byId.get(mapKey)
      byId.set(mapKey, existing ? mergePaymentMethodRecord(existing, pm) : { ...pm })
    }
  }
  return [...byId.values()]
}

/**
 * Paginated Noah `GET /payment-methods` for a customer.
 * Prefer `Capability=PayinTo` for fiat virtual account (deposit) rails, then merge any unfiltered items.
 */
export async function fetchAllPaymentMethodsForCustomer(noahCustomerId: string): Promise<Record<string, unknown>[]> {
  const [payin, all] = await Promise.all([
    fetchPaymentMethodsPaginated(noahCustomerId, "PayinTo"),
    fetchPaymentMethodsPaginated(noahCustomerId),
  ])
  const merged = mergePaymentMethodsById([payin, all])
  if (merged.length > 0) return merged
  return payin.length > 0 ? payin : all
}

/** For diagnostics — counts by capability query. */
export async function fetchPaymentMethodsForCustomerDiagnostics(
  noahCustomerId: string,
): Promise<{ payin: number; all: number }> {
  const [payin, all] = await Promise.all([
    fetchPaymentMethodsPaginated(noahCustomerId, "PayinTo"),
    fetchPaymentMethodsPaginated(noahCustomerId),
  ])
  return { payin: payin.length, all: mergePaymentMethodsById([payin, all]).length }
}
