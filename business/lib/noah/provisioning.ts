import type { SupabaseClient } from "@supabase/supabase-js"
import { noahFetch } from "./http"
import { fetchAllPaymentMethodsForCustomer } from "./list-payment-methods"
import { hasPayinBank, matchesCurrency } from "./payment-method-map"
import { persistVirtualAccountFromPaymentMethod } from "./persist-account-data"
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
}): Promise<ProvisionSummary> {
  const { subjectUserId, subjectBusinessId = null, noahCustomerId } = opts
  const paymentMethods = await fetchAllPaymentMethodsForCustomer(noahCustomerId)

  const usdPm = paymentMethods.find((pm) => hasPayinBank(pm, "US"))
  const eurPm = paymentMethods.find((pm) => {
    const caps = pm.Capabilities as Record<string, unknown> | undefined
    if (caps && caps.PayinTo === false) return false
    return matchesCurrency(pm, "eur")
  })
  const gbpPm = paymentMethods.find((pm) => hasPayinBank(pm, "GB"))

  if (usdPm) await persistVirtualAccountFromPaymentMethod(subjectUserId, "usd", usdPm, subjectBusinessId)
  if (eurPm) await persistVirtualAccountFromPaymentMethod(subjectUserId, "eur", eurPm, subjectBusinessId)
  if (gbpPm) await persistVirtualAccountFromPaymentMethod(subjectUserId, "gbp", gbpPm, subjectBusinessId)

  const usdc =
    (await tryFetchLiquidationAddress(noahCustomerId, "usdc")) ??
    (await tryCreateLiquidationAddress(noahCustomerId, "usdc"))
  const eurc =
    (await tryFetchLiquidationAddress(noahCustomerId, "eurc")) ??
    (await tryCreateLiquidationAddress(noahCustomerId, "eurc"))

  return {
    usdAccountCreated: Boolean(usdPm),
    eurAccountCreated: Boolean(eurPm),
    gbpAccountCreated: Boolean(gbpPm),
    usdAccountId: usdPm ? String(usdPm.ID ?? "") : undefined,
    eurAccountId: eurPm ? String(eurPm.ID ?? "") : undefined,
    gbpAccountId: gbpPm ? String(gbpPm.ID ?? "") : undefined,
    usdcAddress: usdc?.address,
    eurcAddress: eurc?.address,
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
