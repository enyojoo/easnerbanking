import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const PAYROLL_SOURCE_CURRENCIES = ["USD", "EUR"] as const

export function payrollCurrencyFromSourceAccountId(
  sourceAccountId: string | null | undefined,
  fallback = "USD",
): string {
  const match = String(sourceAccountId || "").trim().toLowerCase().match(/^acc_(usd|eur)$/)
  if (match) return match[1].toUpperCase()
  const normalizedFallback = String(fallback || "USD").trim().toUpperCase()
  return PAYROLL_SOURCE_CURRENCIES.includes(normalizedFallback as "USD" | "EUR")
    ? normalizedFallback
    : "USD"
}

export function isPayrollSourceAccountId(value: string): boolean {
  return /^acc_(usd|eur)$/i.test(value.trim())
}

export async function resolvePayrollSourceDefaults(
  admin: ReturnType<typeof createSupabaseAdmin>,
  businessId: string,
): Promise<{ sourceAccountId: string; currency: string; timezone: string; paydayTime: string }> {
  const [{ data: settings, error: settingsError }, { data: business, error: businessError }] =
    await Promise.all([
      admin.from("payroll_settings")
        .select("default_source_account_id,timezone,default_payday_time")
        .eq("business_id", businessId)
        .maybeSingle(),
      admin.from("businesses")
        .select("base_currency")
        .eq("id", businessId)
        .maybeSingle(),
    ])

  if (settingsError || businessError) {
    throw new Error("Could not load Payroll account settings.")
  }

  const baseCurrency = payrollCurrencyFromSourceAccountId(
    `acc_${String(business?.base_currency || "USD").toLowerCase()}`,
  )
  const sourceAccountId = isPayrollSourceAccountId(String(settings?.default_source_account_id || ""))
    ? String(settings?.default_source_account_id)
    : `acc_${baseCurrency.toLowerCase()}`

  return {
    sourceAccountId,
    currency: payrollCurrencyFromSourceAccountId(sourceAccountId, baseCurrency),
    timezone: String(settings?.timezone || "UTC"),
    paydayTime: String(settings?.default_payday_time || "09:00"),
  }
}
