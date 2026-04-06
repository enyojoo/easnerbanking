import type { SupabaseClient } from "@supabase/supabase-js"
import { noahFetch } from "./http"
import { fetchAllPaymentMethodsForCustomer } from "./list-payment-methods"
import { hasPayinBank, matchesCurrency } from "./payment-method-map"
import { persistVirtualAccountFromPaymentMethod } from "./persist-account-data"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type Scope = "individual" | "business"

type LiquidationCurrency = "usdc" | "eurc"

type WalletSnapshot = {
  walletId: string
  address: string
  blockchainMemo: string | null
}

type LiquidationSnapshot = {
  currency: LiquidationCurrency
  chain: "solana"
  address: string
  memo: string | null
}

type ProvisionSummary = {
  walletCreated: boolean
  walletId?: string
  usdAccountCreated: boolean
  eurAccountCreated: boolean
  gbpAccountCreated: boolean
  usdAccountId?: string
  eurAccountId?: string
  gbpAccountId?: string
  usdcAddress?: string
  eurcAddress?: string
}

function parseWalletFromProvider(payload: Record<string, unknown>): WalletSnapshot | null {
  const items = Array.isArray(payload.Items) ? payload.Items : []
  const first = (items[0] ?? payload) as Record<string, unknown>
  const walletIdRaw = first.ID ?? first.WalletID ?? first.walletId
  const addressRaw = first.Address ?? first.address
  if (!walletIdRaw || !addressRaw) return null
  return {
    walletId: String(walletIdRaw),
    address: String(addressRaw),
    blockchainMemo: first.BlockchainMemo != null ? String(first.BlockchainMemo) : null,
  }
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

async function tryFetchWallet(customerId: string): Promise<WalletSnapshot | null> {
  try {
    const payload = await noahFetch<Record<string, unknown>>({
      method: "GET",
      path: "/wallets",
      query: { CustomerID: customerId, PageSize: 10 },
    })
    return parseWalletFromProvider(payload)
  } catch {
    return null
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

async function upsertWalletData(
  subjectUserId: string,
  wallet: WalletSnapshot | null,
  usdc: LiquidationSnapshot | null,
  eurc: LiquidationSnapshot | null,
  subjectBusinessId: string | null,
): Promise<void> {
  if (!wallet) return
  const admin = createSupabaseAdmin()
  await admin.from("wallets").upsert(
    {
      user_id: subjectUserId,
      business_id: subjectBusinessId,
      noah_wallet_id: wallet.walletId,
      address: wallet.address,
      blockchain_memo: wallet.blockchainMemo,
      usdc_liquidation_address: usdc?.address ?? null,
      usdc_liquidation_memo: usdc?.memo ?? null,
      eurc_liquidation_address: eurc?.address ?? null,
      eurc_liquidation_memo: eurc?.memo ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "noah_wallet_id" },
  )

  if (subjectBusinessId) {
    await admin
      .from("businesses")
      .update({ noah_wallet_id: wallet.walletId, updated_at: new Date().toISOString() })
      .eq("id", subjectBusinessId)
  } else {
    await admin
      .from("users")
      .update({ noah_wallet_id: wallet.walletId, updated_at: new Date().toISOString() })
      .eq("id", subjectUserId)
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

  const wallet = await tryFetchWallet(noahCustomerId)
  const usdc = (await tryFetchLiquidationAddress(noahCustomerId, "usdc")) ??
    (await tryCreateLiquidationAddress(noahCustomerId, "usdc"))
  const eurc = (await tryFetchLiquidationAddress(noahCustomerId, "eurc")) ??
    (await tryCreateLiquidationAddress(noahCustomerId, "eurc"))
  await upsertWalletData(subjectUserId, wallet, usdc, eurc, subjectBusinessId)

  return {
    walletCreated: Boolean(wallet),
    walletId: wallet?.walletId,
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
}): Promise<{ hasAddress: boolean; address?: string; memo?: string; walletId?: string }> {
  const { subjectUserId, subjectBusinessId = null, noahCustomerId, currency, ensureCreated = false } = opts
  const fetched = await tryFetchLiquidationAddress(noahCustomerId, currency)
  const created = !fetched && ensureCreated ? await tryCreateLiquidationAddress(noahCustomerId, currency) : null
  const snap = fetched ?? created

  const wallet = await tryFetchWallet(noahCustomerId)
  await upsertWalletData(
    subjectUserId,
    wallet,
    currency === "usdc" ? snap : null,
    currency === "eurc" ? snap : null,
    subjectBusinessId,
  )

  return {
    hasAddress: Boolean(snap?.address),
    address: snap?.address,
    memo: snap?.memo ?? undefined,
    walletId: wallet?.walletId,
  }
}

/** Address stored for Easner’s provisioned Noah wallet row (used as autopayout source / trigger wallet). */
export async function readProvisionedWalletAddressFromDb(
  admin: SupabaseClient,
  opts: { subjectUserId: string; subjectBusinessId: string | null },
): Promise<string | null> {
  const { subjectUserId, subjectBusinessId } = opts
  let wid: string | undefined
  if (subjectBusinessId) {
    const { data: bizRow } = await admin
      .from("businesses")
      .select("noah_wallet_id")
      .eq("id", subjectBusinessId)
      .maybeSingle()
    wid = bizRow?.noah_wallet_id as string | undefined
  } else {
    const { data: userRow } = await admin
      .from("users")
      .select("noah_wallet_id")
      .eq("id", subjectUserId)
      .maybeSingle()
    wid = userRow?.noah_wallet_id as string | undefined
  }
  if (!wid) return null
  const { data: w } = await admin.from("wallets").select("address").eq("noah_wallet_id", wid).maybeSingle()
  const addr = w?.address != null ? String(w.address).trim() : ""
  return addr || null
}
