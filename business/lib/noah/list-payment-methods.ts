import { noahFetch } from "./http"

type PmResp = { Items?: Array<Record<string, unknown>>; PageToken?: string }

/** Paginated Noah `GET /payment-methods` for a customer. */
export async function fetchAllPaymentMethodsForCustomer(noahCustomerId: string): Promise<Record<string, unknown>[]> {
  const all: Array<Record<string, unknown>> = []
  let token: string | undefined
  for (let i = 0; i < 5; i++) {
    const data = await noahFetch<PmResp>({
      method: "GET",
      path: "/payment-methods",
      query: { CustomerID: noahCustomerId, PageSize: 50, ...(token ? { PageToken: token } : {}) },
    })
    const items = data.Items ?? []
    all.push(...items)
    token = data.PageToken
    if (!token || items.length === 0) break
  }
  return all
}
