import { officeFetch } from "@/lib/api-client"

export type CurrencyAdminRow = {
  id: string
  code: string
  name: string
  symbol: string
  flag_svg?: string
  status: string
  can_send?: boolean
  can_receive?: boolean
}

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export const currenciesApi = {
  async list(opts?: { scope?: "fiat" | "rates" }): Promise<CurrencyAdminRow[]> {
    const q = opts?.scope ? `?scope=${opts.scope}` : ""
    const res = await officeFetch(`/api/admin/currencies${q}`)
    const data = await asJson<{ currencies?: CurrencyAdminRow[] }>(res)
    return data.currencies ?? []
  },

  async patch(
    id: string,
    body: { can_send?: boolean; can_receive?: boolean; status?: string },
  ): Promise<CurrencyAdminRow> {
    const res = await officeFetch(`/api/admin/currencies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
    const data = await asJson<{ currency: CurrencyAdminRow }>(res)
    return data.currency
  },

  async create(body: {
    code: string
    name: string
    symbol: string
    flag_svg?: string
    can_send?: boolean
    can_receive?: boolean
  }): Promise<CurrencyAdminRow> {
    const res = await officeFetch("/api/admin/currencies", {
      method: "POST",
      body: JSON.stringify(body),
    })
    const data = await asJson<{ currency: CurrencyAdminRow }>(res)
    return data.currency
  },

  async remove(id: string): Promise<void> {
    const res = await officeFetch(`/api/admin/currencies/${id}`, { method: "DELETE" })
    await asJson<{ ok?: boolean }>(res)
  },
}
