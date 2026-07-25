import type { SupabaseClient } from "@supabase/supabase-js"

export type PayrollExternalMethodType = "bank" | "mobile_money" | "stablecoin"

type RecipientRow = {
  id: string
  user_id: string
  full_name?: string | null
  account_number?: string | null
  bank_name?: string | null
  currency?: string | null
  country_code?: string | null
  phone_number?: string | null
  email?: string | null
  mobile_provider?: string | null
  wallet_network?: string | null
  routing_number?: string | null
  sort_code?: string | null
  iban?: string | null
  swift_bic?: string | null
  transfer_type?: string | null
  checking_or_savings?: string | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}

function cleanRecord(row: RecipientRow): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key, value]) => !["id", "user_id"].includes(key) && typeof value === "string" && value.trim())
      .map(([key, value]) => [key, String(value)]),
  )
}

function inferredType(row: RecipientRow): PayrollExternalMethodType | "easetag" {
  const bankName = String(row.bank_name ?? "")
  if (row.wallet_network || /^Wallet \(/i.test(bankName)) return "stablecoin"
  if (row.mobile_provider || /^Mobile Money \(/i.test(bankName)) return "mobile_money"
  if (/Easetag|Easenet/i.test(bankName)) return "easetag"
  return "bank"
}

/**
 * Resolves a receiving method from the user's existing Send validation pipeline.
 * The payroll API accepts only the recipient id; all payout data is re-read on the
 * server so a client cannot attach another user's destination or forge its rail.
 */
export async function resolvePayrollRecipientMethod(
  admin: SupabaseClient,
  input: { recipientId: string; userId: string; expectedType: PayrollExternalMethodType },
): Promise<{
  providerRecipientId: string
  label: string
  details: Record<string, string>
} | null> {
  const { data } = await admin
    .from("recipients")
    .select("*")
    .eq("id", input.recipientId)
    .eq("user_id", input.userId)
    .maybeSingle()
  if (!data) return null

  const row = data as RecipientRow
  if (inferredType(row) !== input.expectedType) return null

  const payoutSnapshot = cleanRecord(row)
  if (input.expectedType === "bank") {
    if (!row.bank_name?.trim() || !row.account_number?.trim()) return null
    return {
      providerRecipientId: row.id,
      label: row.bank_name,
      details: {
        ...payoutSnapshot,
        bankName: row.bank_name,
        accountNumber: row.account_number,
      },
    }
  }
  if (input.expectedType === "mobile_money") {
    const provider = String(row.mobile_provider || row.bank_name?.match(/^Mobile Money \((.*?)(?:\|CC:.*)?\)$/i)?.[1] || "").trim()
    const phoneNumber = String(row.phone_number || row.account_number || "").trim()
    if (!provider || !phoneNumber) return null
    return {
      providerRecipientId: row.id,
      label: provider,
      details: { ...payoutSnapshot, provider, phoneNumber },
    }
  }

  const network = String(row.wallet_network || row.bank_name?.match(/^Wallet \((.*)\)$/i)?.[1] || "").trim()
  const walletAddress = String(row.account_number || "").trim()
  if (!network || !walletAddress) return null
  return {
    providerRecipientId: row.id,
    label: `${network} wallet`,
    details: { ...payoutSnapshot, network, walletAddress },
  }
}
