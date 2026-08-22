import { NextResponse } from "next/server"
import {
  EXPRESS_DEPOSITS_COPY,
  expressDepositsLimits,
  expressDepositsNextStep,
  expressDepositsSourceCurrency,
  normalizeExpressDepositsCustomer,
  resolveCashPayInMethods,
} from "@easner/shared"
import { getApplePayMerchantId } from "@/lib/stripe/onramp-config"
import { getStripePublishableKey } from "@/lib/stripe/config"
import { stripeOnrampOfficeFlags } from "@/lib/stripe/onramp-gate"
import { kycPrefillFromPayer, resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"
import { stripeOnramp } from "@/lib/stripe/onramp-client"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const resolved = await resolveExpressDepositsContext(request, { requireEligible: false })
  if ("error" in resolved) return resolved.error
  const { payer, businessId, eligible, payerCountry, oauthToken } = resolved.ctx
  const office = stripeOnrampOfficeFlags()
  let customer = payer.stripe_crypto_customer_id
    ? { id: payer.stripe_crypto_customer_id }
    : null
  let walletRegistered = false
  if (payer.stripe_crypto_customer_id) {
    try {
      customer =
        normalizeExpressDepositsCustomer(
          await stripeOnramp.retrieveCustomer(payer.stripe_crypto_customer_id, oauthToken || undefined),
        ) ?? { id: payer.stripe_crypto_customer_id }
    } catch {
      customer = { id: payer.stripe_crypto_customer_id }
    }
    try {
      const wallets = (await stripeOnramp.listWallets(
        payer.stripe_crypto_customer_id,
        oauthToken || undefined,
      )) as { data?: unknown[] }
      walletRegistered = Array.isArray(wallets.data) && wallets.data.length > 0
    } catch {
      walletRegistered = false
    }
  }

  const nextStep = expressDepositsNextStep({
    cryptoCustomerId: payer.stripe_crypto_customer_id,
    customer,
    payerCountry,
    walletRegistered,
  })
  const ready = nextStep === "ready"
  const sourceCurrency = expressDepositsSourceCurrency(payerCountry)
  const methods = resolveCashPayInMethods({
    product: businessId ? "business" : "mobile",
    ledgerCurrency: "USD",
    payerCountry,
    payerState: payer.kyc_address_state,
    tier1Complete: true,
    expressDepositsReady: ready,
    officeFlags: office,
    showVaBank: false,
    localBankAvailable: false,
    localMomoAvailable: false,
  })
    .filter((m) => m.kind.startsWith("express_"))
    .map((m) => m.kind)

  const kycTier =
    (customer?.kyc_tiers ?? []).find((t) => String(t.verification_status).toLowerCase() === "verified")
      ?.tier ?? null

  return NextResponse.json({
    copy: EXPRESS_DEPOSITS_COPY,
    office,
    eligible,
    payerCountry,
    sourceCurrency,
    limits: expressDepositsLimits(sourceCurrency),
    nextStep,
    methods,
    publishableKey: getStripePublishableKey(),
    applePayMerchantId: getApplePayMerchantId(),
    businessId,
    cryptoCustomerId: payer.stripe_crypto_customer_id ?? null,
    kycRegion: customer?.kyc_region ?? null,
    kycTiers: customer?.kyc_tiers ?? [],
    providedFields: customer?.provided_fields ?? [],
    status: ready ? "ready" : payer.stripe_crypto_customer_id ? "in_progress" : "not_started",
    kycTier,
    paymentTokenId: payer.stripe_express_payment_token_id ?? null,
    ready,
    walletRegistered,
    prefill: kycPrefillFromPayer(payer),
  })
}
