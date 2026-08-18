import { officeFetch } from "@/lib/api-client"

export type CheckoutFeeMode = "merchant_net" | "buyer_surcharge" | "easner_absorbs"

export type CheckoutFeeOverrideState = {
  feeMode: CheckoutFeeMode
  businessFeeMode: CheckoutFeeMode | null
  overrideFeeMode: CheckoutFeeMode | null
  overrideReason: string | null
  availableModes: CheckoutFeeMode[]
}

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export const CHECKOUT_FEE_MODE_LABELS: Record<CheckoutFeeMode, string> = {
  merchant_net: "Merchant net",
  buyer_surcharge: "Buyer surcharge",
  easner_absorbs: "Easner absorbs fees",
}

export const CHECKOUT_FEE_MODE_HINTS: Record<CheckoutFeeMode, string> = {
  merchant_net: "Customer pays the listed amount; processing is deducted before the merchant's balance.",
  buyer_surcharge: "Customer pays listed plus processing; merchant receives the full listed amount.",
  easner_absorbs: "Customer and merchant both see the listed amount; Easner eats the processing cost.",
}

export const checkoutFeeOverrideApi = {
  async get(businessId: string): Promise<CheckoutFeeOverrideState> {
    const params = new URLSearchParams({ business_id: businessId })
    const res = await officeFetch(`/api/admin/checkout-fee-override?${params}`)
    return asJson<CheckoutFeeOverrideState>(res)
  },

  async set(businessId: string, feeMode: CheckoutFeeMode, reason: string | null): Promise<void> {
    const res = await officeFetch("/api/admin/checkout-fee-override", {
      method: "PUT",
      body: JSON.stringify({ business_id: businessId, fee_mode: feeMode, reason }),
    })
    await asJson<{ overrideFeeMode: CheckoutFeeMode }>(res)
  },

  async clear(businessId: string): Promise<void> {
    const params = new URLSearchParams({ business_id: businessId })
    const res = await officeFetch(`/api/admin/checkout-fee-override?${params}`, {
      method: "DELETE",
    })
    await asJson<{ ok?: boolean }>(res)
  },
}
