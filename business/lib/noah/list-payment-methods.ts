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

function mergePaymentMethodsById(lists: Record<string, unknown>[][]): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>()
  for (const list of lists) {
    for (const pm of list) {
      const id = String(pm.ID ?? pm.Id ?? "").trim()
      if (id) byId.set(id, pm)
      else byId.set(`anon-${byId.size}`, pm)
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
