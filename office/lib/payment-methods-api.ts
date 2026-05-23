import { officeFetch } from "@/lib/api-client"

export type PaymentMethodAdminRow = {
  id: string
  currency: string
  type: string
  name: string
  display_logo_url?: string | null
  account_name?: string | null
  account_number?: string | null
  bank_name?: string | null
  routing_number?: string | null
  sort_code?: string | null
  iban?: string | null
  swift_bic?: string | null
  mobile_money_provider?: string | null
  phone_number?: string | null
  qr_code_data?: string | null
  instructions?: string | null
  is_default: boolean
  status: string
  completion_timer_seconds?: number | null
  created_at: string
  updated_at: string
}

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export const paymentMethodsApi = {
  async list(): Promise<PaymentMethodAdminRow[]> {
    const res = await officeFetch("/api/admin/payment-methods")
    const data = await asJson<{ payment_methods?: PaymentMethodAdminRow[] }>(res)
    return data.payment_methods ?? []
  },

  async create(body: Record<string, unknown>): Promise<PaymentMethodAdminRow> {
    const res = await officeFetch("/api/admin/payment-methods", {
      method: "POST",
      body: JSON.stringify(body),
    })
    const data = await asJson<{ payment_method: PaymentMethodAdminRow }>(res)
    return data.payment_method
  },

  async patch(id: string, body: Record<string, unknown>): Promise<PaymentMethodAdminRow> {
    const res = await officeFetch(`/api/admin/payment-methods/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
    const data = await asJson<{ payment_method: PaymentMethodAdminRow }>(res)
    return data.payment_method
  },

  async remove(id: string): Promise<void> {
    const res = await officeFetch(`/api/admin/payment-methods/${id}`, { method: "DELETE" })
    await asJson<{ ok?: boolean }>(res)
  },

  async uploadDisplayLogo(file: File): Promise<string> {
    const form = new FormData()
    form.append("file", file)
    const res = await officeFetch("/api/admin/payment-methods/upload-logo", {
      method: "POST",
      body: form,
    })
    const data = await asJson<{ url?: string }>(res)
    if (!data.url) throw new Error("Upload did not return a URL")
    return data.url
  },

  async deleteDisplayLogo(url: string): Promise<void> {
    const res = await officeFetch("/api/admin/payment-methods/display-logo", {
      method: "DELETE",
      body: JSON.stringify({ url }),
    })
    await asJson<{ ok?: boolean }>(res)
  },
}
