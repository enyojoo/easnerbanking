import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureFiatVirtualAccountsViaBankOnramp } from "@/lib/noah/bank-onramp-virtual-accounts"
import { noahFetch } from "./http"
import { fetchAllPaymentMethodsForCustomer } from "./list-payment-methods"
import { hasPayinBank, matchesCurrency } from "./payment-method-map"
import { persistAllPayinVirtualAccountsFromPaymentMethods } from "./persist-account-data"
import {
  selectPreferredEurPayinPaymentMethod,
  selectPreferredUsdPayinPaymentMethod,
} from "./payment-method-map"
import type { NoahAccountContext } from "./resolve-account-context"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"

type Scope = "individual" | "business"

type LiquidationCurrency = "usdc" | "eurc"

type LiquidationSnapshot = {
  currency: LiquidationCurrency
  chain: "solana"
  address: string
  memo: string | null
}

type ProvisionSummary = {
  usdAccountCreated: boolean
  eurAccountCreated: boolean
  gbpAccountCreated: boolean
  usdAccountId?: string
  eurAccountId?: string
  gbpAccountId?: string
  usdcAddress?: string
  eurcAddress?: string
  usdBankOnrampAttempted?: boolean
  eurBankOnrampAttempted?: boolean
  usdBankOnrampCreated?: boolean
  eurBankOnrampCreated?: boolean
}

function parseLiquidationFromProvider(
  payload: Record<string, unknown>,
  currency: LiquidationCurrency,
): LiquidationSnapshot | null {
  const items = Array.isArray(payload.Items) ? payload.Items : []
  const first = (items[0] ?? payload) as Record<string, unknown>
  const addressRaw = first.Address ?? first.address
  if (!addressRaw) return null
  return {
    currency,
    chain: "solana",
    address: String(addressRaw),
    memo: first.Memo != null ? String(first.Memo) : null,
  }
}

async function tryFetchLiquidationAddress(
  customerId: string,
  currency: LiquidationCurrency,
): Promise<LiquidationSnapshot | null> {
  try {
    const payload = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: "/liquidation-addresses",
      query: { CustomerID: customerId, Currency: currency.toUpperCase(), Chain: "solana" },
    })
    return parseLiquidationFromProvider(payload, currency)
  } catch {
    return null
  }
}

async function tryCreateLiquidationAddress(
  customerId: string,
  currency: LiquidationCurrency,
): Promise<LiquidationSnapshot | null> {
  try {
    const payload = await noahFetch<Record<string, unknown>>({
      method: "POST",
      path: "/liquidation-addresses",
      json: { CustomerID: customerId, Currency: currency.toUpperCase(), Chain: "solana" },
    })
    return parseLiquidationFromProvider(payload, currency)
  } catch {
    return null
  }
}

export async function provisionNoahArtifactsForCustomer(opts: {
  subjectUserId: string
  subjectBusinessId?: string | null
  noahCustomerId: string
  scope: Scope
  /** When set, runs bank-deposit-to-onchain workflow for missing USD/EUR VAs. */
  admin?: SupabaseClient
}): Promise<ProvisionSummary> {
  const { subjectUserId, subjectBusinessId = null, noahCustomerId, admin } = opts
  const paymentMethods = await fetchAllPaymentMethodsForCustomer(noahCustomerId)

  if (paymentMethods.length === 0) {
    console.warn("[provisionNoahArtifactsForCustomer] no payment methods from Noah", {
      noahCustomerId,
      scope: opts.scope,
      businessId: subjectBusinessId,
    })
  }

  const usdPm = selectPreferredUsdPayinPaymentMethod(paymentMethods)
  const eurPm = selectPreferredEurPayinPaymentMethod(paymentMethods)
  const gbpPm = paymentMethods.find((pm) => hasPayinBank(pm, "GB"))

  if (!usdPm || !eurPm) {
    console.warn("[provisionNoahArtifactsForCustomer] missing fiat VA payment methods", {
      noahCustomerId,
      scope: opts.scope,
      paymentMethodCount: paymentMethods.length,
      usdFound: Boolean(usdPm),
      eurFound: Boolean(eurPm),
      sample: paymentMethods.slice(0, 3).map((pm) => ({
        id: pm.ID,
        country: pm.Country,
        fiat: pm.FiatCurrency,
        entity: pm.Entity,
        displayType: (pm.DisplayDetails as Record<string, unknown> | undefined)?.Type,
      })),
    })
  }

  await persistAllPayinVirtualAccountsFromPaymentMethods(
    subjectUserId,
    paymentMethods,
    subjectBusinessId,
    noahCustomerId,
  )

  let usdAccountCreated = Boolean(usdPm)
  let eurAccountCreated = Boolean(eurPm)
  let bankOnrampSummary = {
    usdBankOnrampAttempted: false,
    eurBankOnrampAttempted: false,
    usdBankOnrampCreated: false,
    eurBankOnrampCreated: false,
  }

  if (admin && (!usdAccountCreated || !eurAccountCreated)) {
    bankOnrampSummary = await ensureFiatVirtualAccountsViaBankOnramp(admin, {
      scope: opts.scope,
      subjectUserId,
      subjectBusinessId,
      noahCustomerId,
      hasUsdPaymentMethod: usdAccountCreated,
      hasEurPaymentMethod: eurAccountCreated,
    })
    usdAccountCreated = usdAccountCreated || bankOnrampSummary.usdBankOnrampCreated
    eurAccountCreated = eurAccountCreated || bankOnrampSummary.eurBankOnrampCreated
  }

  const finalPms = await fetchAllPaymentMethodsForCustomer(noahCustomerId)
  await persistAllPayinVirtualAccountsFromPaymentMethods(
    subjectUserId,
    finalPms,
    subjectBusinessId,
    noahCustomerId,
  )
  const usdFinal = selectPreferredUsdPayinPaymentMethod(finalPms)
  const eurFinal = selectPreferredEurPayinPaymentMethod(finalPms)
  if (usdFinal) usdAccountCreated = true
  if (eurFinal) eurAccountCreated = true

  const usdc =
    (await tryFetchLiquidationAddress(noahCustomerId, "usdc")) ??
    (await tryCreateLiquidationAddress(noahCustomerId, "usdc"))
  const eurc =
    (await tryFetchLiquidationAddress(noahCustomerId, "eurc")) ??
    (await tryCreateLiquidationAddress(noahCustomerId, "eurc"))

  return {
    usdAccountCreated,
    eurAccountCreated,
    gbpAccountCreated: Boolean(gbpPm),
    usdAccountId: usdFinal ? String(usdFinal.ID ?? "") : usdPm ? String(usdPm.ID ?? "") : undefined,
    eurAccountId: eurFinal ? String(eurFinal.ID ?? "") : eurPm ? String(eurPm.ID ?? "") : undefined,
    gbpAccountId: gbpPm ? String(gbpPm.ID ?? "") : undefined,
    usdcAddress: usdc?.address,
    eurcAddress: eurc?.address,
    ...bankOnrampSummary,
  }
}

export async function getNoahLiquidationAddressForCustomer(opts: {
  subjectUserId: string
  subjectBusinessId?: string | null
  noahCustomerId: string
  currency: LiquidationCurrency
  ensureCreated?: boolean
}): Promise<{ hasAddress: boolean; address?: string; memo?: string }> {
  const { noahCustomerId, currency, ensureCreated = false } = opts
  const fetched = await tryFetchLiquidationAddress(noahCustomerId, currency)
  const created = !fetched && ensureCreated ? await tryCreateLiquidationAddress(noahCustomerId, currency) : null
  const snap = fetched ?? created

  return {
    hasAddress: Boolean(snap?.address),
    address: snap?.address,
    memo: snap?.memo ?? undefined,
  }
}

/** Turnkey Solana USDC address for payout/autopayout source (Noah does not provision custodial wallets). */
export async function readTurnkeySolanaUsdcAddressFromContext(
  admin: SupabaseClient,
  ctx: Pick<NoahAccountContext, "subjectUserId" | "subjectBusinessId" | "scope" | "noahCustomerId">,
): Promise<string | null> {
  const accountCtx: NoahAccountContext = {
    subjectUserId: ctx.subjectUserId,
    subjectBusinessId: ctx.subjectBusinessId ?? null,
    scope: ctx.scope,
    noahCustomerId: ctx.noahCustomerId,
    customerType: ctx.scope === "business" ? "Business" : "Individual",
  }
  return resolveTurnkeyAddressForNoahPair(admin, accountCtx, "USDC", "Solana")
}
