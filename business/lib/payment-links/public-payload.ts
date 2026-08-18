import type { SupabaseClient } from "@supabase/supabase-js"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import { isOnlineCheckoutEnabled } from "@/lib/stripe/config"
import { resolveConnectReadyForCheckout } from "@/lib/stripe/connect"
import { resolveOnlinePaymentsEnabled } from "@/lib/stripe/resolve-online-payments-enabled"
import { resolveCheckoutFeeMode } from "@/lib/stripe/checkout-fee-mode"
import { computeCheckoutAmounts } from "@/lib/stripe/application-fee"
import { mapRowToPaymentLink, type PaymentLink } from "./types"

export type PublicPayBusiness = {
  name: string
  logoUrl: string | null
  easetag: string | null
}

export type PublicPaymentLinkPayload = {
  kind: "payment_link"
  link: Omit<PaymentLink, "autopayoutConfigId">
  business: PublicPayBusiness
  /** Card and bank payments are ready for this business. */
  onlinePaymentsEnabled: boolean
  /** What the customer is charged – above the listed amount when the business adds the fee. */
  customerAmountCents: number
  /** Set when the customer pays the processing fee, so the pay page can show the breakdown. */
  surchargeCents: number
  /** Static deposit details for stablecoin links. */
  stablecoin: {
    depositAddress: string | null
    depositMemo: string | null
    cryptoCurrency: string
    network: string
  } | null
}

export type PublicStablecoinSessionPayload = {
  kind: "stablecoin_session"
  sessionId: string
}

export type PublicPayPayload = PublicPaymentLinkPayload | PublicStablecoinSessionPayload

async function fetchPublicBusiness(
  admin: SupabaseClient,
  businessId: string,
): Promise<{ business: PublicPayBusiness; tier1Complete: boolean }> {
  const { data } = await admin
    .from("businesses")
    .select("name, logo_url, easetag, verification_status, verification_provider, grid_customer_id")
    .eq("id", businessId)
    .maybeSingle()

  return {
    business: {
      name: typeof data?.name === "string" && data.name.trim() ? data.name.trim() : "This business",
      logoUrl: typeof data?.logo_url === "string" && data.logo_url ? data.logo_url : null,
      easetag: typeof data?.easetag === "string" && data.easetag ? data.easetag : null,
    },
    tier1Complete: isBusinessTier1Complete(data),
  }
}

/** Customer-facing payload for a Payment Link – never exposes provider ids or payout details. */
export async function buildPublicPaymentLinkPayload(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<PublicPaymentLinkPayload> {
  const link = mapRowToPaymentLink(row)
  const businessId = String(row.business_id)
  const { business, tier1Complete } = await fetchPublicBusiness(admin, businessId)

  let onlinePaymentsEnabled = false
  let customerAmountCents = link.amountCents
  let surchargeCents = 0

  if (link.rail === "card_bank" && tier1Complete && isOnlineCheckoutEnabled()) {
    const { enabled: masterEnabled } = await resolveOnlinePaymentsEnabled(admin, businessId)
    const connect = await resolveConnectReadyForCheckout(admin, businessId, {
      currency: link.currency,
    })
    onlinePaymentsEnabled = masterEnabled && connect.ready
    if (onlinePaymentsEnabled) {
      const { feeMode } = await resolveCheckoutFeeMode(admin, businessId)
      const amounts = computeCheckoutAmounts({ listedAmountCents: link.amountCents, feeMode })
      customerAmountCents = amounts.customerAmountCents
      surchargeCents = amounts.surchargeCents
    }
  }

  let stablecoin: PublicPaymentLinkPayload["stablecoin"] = null
  if (link.rail === "stablecoin" && link.autopayoutConfigId) {
    const { data: config } = await admin
      .from("autopayout_configs")
      .select("deposit_address, deposit_memo, crypto_currency, network")
      .eq("id", link.autopayoutConfigId)
      .eq("business_id", businessId)
      .maybeSingle()
    stablecoin = {
      depositAddress: typeof config?.deposit_address === "string" ? config.deposit_address : null,
      depositMemo: typeof config?.deposit_memo === "string" ? config.deposit_memo : null,
      cryptoCurrency: String(config?.crypto_currency ?? ""),
      network: String(config?.network ?? ""),
    }
  }

  const { autopayoutConfigId: _autopayoutConfigId, ...publicLink } = link

  return {
    kind: "payment_link",
    link: publicLink,
    business,
    onlinePaymentsEnabled,
    customerAmountCents,
    surchargeCents,
    stablecoin,
  }
}
