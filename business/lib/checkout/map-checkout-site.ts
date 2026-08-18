import type { CheckoutSite } from "@/lib/checkout/hub-types"

export function mapCheckoutSite(row: {
  id: string
  origin: string
  success_url?: string | null
  cancel_url?: string | null
  created_at?: string | null
  updated_at?: string | null
}): CheckoutSite {
  return {
    id: row.id,
    origin: row.origin,
    successUrl: row.success_url ?? null,
    cancelUrl: row.cancel_url ?? null,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  }
}
