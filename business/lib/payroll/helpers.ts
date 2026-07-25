import type { SupabaseClient } from "@supabase/supabase-js"
import type { PayrollRail } from "@/lib/payroll/types"

export async function readBusinessAvailableBalance(
  admin: SupabaseClient,
  businessId: string,
  currency: string,
): Promise<number> {
  const { data, error } = await admin
    .from("wallet_balances")
    .select("available_balance")
    .eq("business_id", businessId)
    .eq("currency", currency.toUpperCase())
    .maybeSingle()

  if (error) return 0
  return Number(data?.available_balance ?? 0)
}

export function computeShortfall(totalRequired: number, available: number): number {
  const gap = totalRequired - available
  return gap > 0 ? Math.round(gap * 100) / 100 : 0
}

export function railLabel(rail: PayrollRail): string {
  switch (rail) {
    case "easetag":
      return "EASETAG"
    case "mobile":
      return "Mobile money"
    case "intl_bank":
      return "International bank"
    case "crypto":
      return "Stablecoin"
    case "bank":
    default:
      return "Bank"
  }
}

export function personNeedsDestination(input: {
  rail: PayrollRail
  recipientId: string | null
  easetag: string | null
}): boolean {
  if (input.rail === "easetag") return !input.easetag?.trim()
  return !input.recipientId
}
