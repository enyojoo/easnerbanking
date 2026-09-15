import type { SupabaseClient } from "@supabase/supabase-js"
import { persistBridgeVirtualAccount } from "./persist-virtual-accounts"
import {
  type BridgeVirtualAccount,
  bridgeVaSourceCurrency,
  createBridgeVirtualAccount,
  isBridgeVaLinkedToTurnkeyVault,
  listBridgeVirtualAccounts,
  updateBridgeVirtualAccountDestination,
} from "./virtual-accounts"
import {
  ensureBusinessTurnkeyCustody,
  ensureIndividualTurnkeyCustody,
} from "@/lib/wallet/ensure-business-turnkey-custody"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"
import { ensureStablecoinTokenAccountOnChain } from "@/lib/turnkey/ensure-spl-token-account"

async function resolveTurnkeyVault(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  asset: "USDC" | "EURC"
}): Promise<{ vaultAddress: string; destCurrency: "usdc" | "eurc" } | null> {
  const ownerType = input.businessId ? "business" : "individual"
  const ownerRef = input.businessId ?? input.userId
  const walletOwnerId = await getWalletOwnerId(input.admin, ownerType, ownerRef)
  if (!walletOwnerId) return null
  const ledger = input.asset === "EURC" ? "EUR" : "USD"
  const { data } = await input.admin
    .from("wallet_accounts")
    .select("address,turnkey_sub_organization_id")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("ledger_currency", ledger)
    .eq("asset", input.asset)
    .eq("status", "active")
    .maybeSingle()
  const vaultAddress = String(data?.address ?? "").trim()
  if (!vaultAddress) return null
  const subOrgId = String(data?.turnkey_sub_organization_id ?? "").trim()
  if (subOrgId) {
    await ensureStablecoinTokenAccountOnChain({
      subOrgId,
      vaultAddress,
      asset: input.asset,
      admin: input.admin,
    })
  }
  return {
    vaultAddress,
    destCurrency: input.asset === "EURC" ? "eurc" : "usdc",
  }
}

async function ensureLinkedBridgeVa(input: {
  admin: SupabaseClient
  customerId: string
  userId: string
  businessId: string | null
  sourceCurrency: "usd" | "eur"
  existing: BridgeVirtualAccount | undefined
}): Promise<BridgeVirtualAccount | null> {
  const asset = input.sourceCurrency === "eur" ? "EURC" : "USDC"
  const vault = await resolveTurnkeyVault({
    admin: input.admin,
    userId: input.userId,
    businessId: input.businessId,
    asset,
  })
  if (!vault) {
    console.warn(`[bridge] ${asset} Turnkey vault is not ready; skipping ${input.sourceCurrency} VA`)
    return null
  }

  if (input.existing?.id && isBridgeVaLinkedToTurnkeyVault(input.existing, vault)) {
    return input.existing
  }

  if (input.existing?.id) {
    try {
      const updated = await updateBridgeVirtualAccountDestination({
        customerId: input.customerId,
        virtualAccountId: input.existing.id,
        destCurrency: vault.destCurrency,
        vaultAddress: vault.vaultAddress,
      })
      if (isBridgeVaLinkedToTurnkeyVault(updated, vault)) return updated
    } catch (error) {
      console.warn(`[bridge] ${input.sourceCurrency} virtual account retarget failed`, error)
      const msg = error instanceof Error ? error.message : ""
      if (msg.toLowerCase().includes("not authorized")) return null
    }
  }

  try {
    const created = await createBridgeVirtualAccount({
      admin: input.admin,
      customerId: input.customerId,
      userId: input.userId,
      businessId: input.businessId,
      sourceCurrency: input.sourceCurrency,
      idempotencyKey: `bridge-va-${input.sourceCurrency}:${input.businessId ?? input.userId}:${input.customerId}`,
    })
    return isBridgeVaLinkedToTurnkeyVault(created, vault) ? created : null
  } catch (error) {
    console.warn(`[bridge] ${input.sourceCurrency.toUpperCase()} virtual account create failed`, error)
    return null
  }
}

export async function provisionBridgeVirtualAccounts(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  customerId: string
  /** Skip when a Turnkey vault job just completed and is retrying VAs. */
  ensureTurnkey?: boolean
}): Promise<{ usd: boolean; eur: boolean }> {
  const customerId = input.customerId.trim()
  if (!customerId) return { usd: false, eur: false }

  if (input.ensureTurnkey !== false) {
    if (input.businessId) {
      await ensureBusinessTurnkeyCustody({
        admin: input.admin,
        businessId: input.businessId,
        subjectUserId: input.userId,
      })
    } else {
      await ensureIndividualTurnkeyCustody({
        admin: input.admin,
        userId: input.userId,
      })
    }
  }

  const existing = await listBridgeVirtualAccounts(customerId).catch(() => [])
  const linked: BridgeVirtualAccount[] = []

  for (const sourceCurrency of ["usd", "eur"] as const) {
    const matches = existing.filter((va) => bridgeVaSourceCurrency(va) === sourceCurrency)
    const first = matches[0]
    const account = await ensureLinkedBridgeVa({
      admin: input.admin,
      customerId,
      userId: input.userId,
      businessId: input.businessId,
      sourceCurrency,
      existing: first,
    })
    if (account) linked.push(account)
    for (const extra of matches.slice(1)) {
      const extraLinked = await ensureLinkedBridgeVa({
        admin: input.admin,
        customerId,
        userId: input.userId,
        businessId: input.businessId,
        sourceCurrency,
        existing: extra,
      })
      if (extraLinked) linked.push(extraLinked)
    }
  }

  let usd = false
  let eur = false
  for (const account of linked) {
    const ok = await persistBridgeVirtualAccount({
      admin: input.admin,
      userId: input.userId,
      businessId: input.businessId,
      customerId,
      account,
    })
    if (!ok) {
      console.warn("[bridge] persist virtual account skipped or failed", {
        vaId: account.id,
        source: bridgeVaSourceCurrency(account),
      })
    }
    const cur = bridgeVaSourceCurrency(account)
    if (ok && cur === "usd") usd = true
    if (ok && cur === "eur") eur = true
  }
  return { usd, eur }
}
