import { NextResponse } from "next/server"
import {
  EXPRESS_DEPOSITS_COPY,
  expressDepositsHighestVerifiedTier,
  expressDepositsKycReady,
  expressDepositsLimits,
  expressDepositsNextStep,
  expressDepositsPersistStatus,
  expressDepositsSourceCurrency,
  normalizeExpressDepositsCustomer,
  parseExpressSavedPaymentMethods,
  resolveCashPayInMethods,
  usPayInAllowsExpress,
  type ExpressDepositsCustomerSnapshot,
} from "@easner/shared"
import { getApplePayMerchantId } from "@/lib/stripe/onramp-config"
import { getStripePublishableKey } from "@/lib/stripe/config"
import { stripeOnrampOfficeFlags } from "@/lib/stripe/onramp-gate"
import {
  kycPrefillFromPayer,
  persistExpressDepositsKyc,
  resolveExpressDepositsContext,
  retrieveExpressCustomerWithOAuth,
} from "@/lib/stripe/onramp-context"
import { stripeOnramp } from "@/lib/stripe/onramp-client"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { loadUsUsdBankPayInMode } from "@/lib/stripe/us-pay-in-corridor"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const resolved = await resolveExpressDepositsContext(request, { requireEligible: false })
  if ("error" in resolved) return resolved.error
  const { admin, payer, payerUserId, businessId, eligible, payerCountry, oauthToken, oauthRefreshToken } =
    resolved.ctx
  const usPayInMode = await loadUsUsdBankPayInMode(createSupabaseAdmin())
  const office = stripeOnrampOfficeFlags({
    usPayInAllowsExpress: usPayInAllowsExpress(usPayInMode),
  })
  let customer: ExpressDepositsCustomerSnapshot | null = payer.stripe_crypto_customer_id
    ? { id: payer.stripe_crypto_customer_id }
    : null
  let walletRegistered = false
  let retrievedOk = false
  let liveOAuth = oauthToken
  if (payer.stripe_crypto_customer_id) {
    try {
      const retrieved = await retrieveExpressCustomerWithOAuth({
        admin,
        payerUserId,
        customerId: payer.stripe_crypto_customer_id,
        oauthToken,
        oauthRefreshToken,
      })
      liveOAuth = retrieved.oauthToken
      customer = normalizeExpressDepositsCustomer(retrieved.customer) ?? {
        id: payer.stripe_crypto_customer_id,
      }
      retrievedOk = Boolean(customer.kyc_tiers && customer.kyc_tiers.length > 0)
    } catch {
      customer = { id: payer.stripe_crypto_customer_id }
    }
    try {
      const wallets = (await stripeOnramp.listWallets(
        payer.stripe_crypto_customer_id,
        liveOAuth || undefined,
      )) as { data?: unknown[] }
      walletRegistered = Array.isArray(wallets.data) && wallets.data.length > 0
    } catch {
      walletRegistered = false
    }
  }

  const storedReady = payer.stripe_express_deposits_status === "ready"
  if (storedReady && !walletRegistered && (!retrievedOk || expressDepositsKycReady(customer))) {
    walletRegistered = true
  }

  const liveNextStep = expressDepositsNextStep({
    cryptoCustomerId: payer.stripe_crypto_customer_id,
    customer,
    payerCountry,
    walletRegistered,
  })
  const nextStep = !retrievedOk && storedReady ? "ready" : liveNextStep
  const ready = nextStep === "ready"
  const kycTier = expressDepositsHighestVerifiedTier(customer)
  if (retrievedOk) {
    await persistExpressDepositsKyc(admin, payerUserId, payer, {
      nextStep,
      kycTier,
    })
  }
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
    status: expressDepositsPersistStatus(nextStep),
    kycTier,
    paymentTokenId: payer.stripe_express_payment_token_id ?? null,
    paymentMethods: parseExpressSavedPaymentMethods(payer.stripe_express_payment_methods),
    ready,
    walletRegistered,
    prefill: kycPrefillFromPayer(payer),
  })
}
