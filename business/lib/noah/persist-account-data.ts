import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { mapPaymentMethodToVirtualAccountDisplay } from "./payment-method-map"

/**
 * Upsert `virtual_accounts` and mirror VA ids on `users` or `businesses`.
 */
export async function persistVirtualAccountFromPaymentMethod(
  subjectUserId: string,
  currency: "usd" | "eur" | "gbp",
  pm: Record<string, unknown>,
  businessId?: string | null,
): Promise<void> {
  const pmId = String(pm.ID ?? "").trim()
  if (!pmId) return

  const admin = createSupabaseAdmin()
  const display = mapPaymentMethodToVirtualAccountDisplay(pm, currency)
  const fiat = currency.toUpperCase()

  const { error: upsertErr } = await admin.from("virtual_accounts").upsert(
    {
      user_id: subjectUserId,
      business_id: businessId ?? null,
      noah_virtual_account_id: pmId,
      currency: fiat,
      account_number: display.accountNumber ?? null,
      routing_number: display.routingNumber ?? null,
      iban: display.iban ?? null,
      bic: display.bic ?? null,
      bank_name: display.bankName ?? null,
      bank_address: display.bankAddress ?? null,
      account_holder_name: display.accountHolderName ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "noah_virtual_account_id" },
  )

  if (upsertErr) {
    console.error("[persistVirtualAccountFromPaymentMethod] upsert virtual_accounts:", upsertErr)
    return
  }

  if (currency === "usd" || currency === "eur") {
    const col = currency === "usd" ? "noah_usd_virtual_account_id" : "noah_eur_virtual_account_id"
    if (businessId) {
      const { error: bizErr } = await admin
        .from("businesses")
        .update({ [col]: pmId, updated_at: new Date().toISOString() })
        .eq("id", businessId)
      if (bizErr) console.error("[persistVirtualAccountFromPaymentMethod] update businesses:", bizErr)
    } else {
      const { error: userErr } = await admin
        .from("users")
        .update({ [col]: pmId, updated_at: new Date().toISOString() })
        .eq("id", subjectUserId)
      if (userErr) console.error("[persistVirtualAccountFromPaymentMethod] update users:", userErr)
    }
  }
}
