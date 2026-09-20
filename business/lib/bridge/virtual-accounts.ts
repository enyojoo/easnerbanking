import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureStablecoinTokenAccountOnChain } from "@/lib/turnkey/ensure-spl-token-account"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"
import { bridgeFetch } from "./http"

export type BridgeVirtualAccount = {
  id: string
  status?: string
  source_deposit_instructions?: {
    currency?: string
    bank_name?: string
    bank_address?: string
    account_holder_name?: string
    bank_beneficiary_name?: string
    account_number?: string
    bank_account_number?: string
    routing_number?: string
    bank_routing_number?: string
    iban?: string
    bic?: string
    swift?: string
    payment_rail?: string
  }
  destination?: {
    currency?: string
    payment_rail?: string
    address?: string
  }
}

async function resolveTurnkeyVault(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  asset: "USDC" | "EURC"
}): Promise<{ vaultAddress: string; subOrgId: string | null } | null> {
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
  return {
    vaultAddress,
    subOrgId: String(data?.turnkey_sub_organization_id ?? "").trim() || null,
  }
}

export function bridgeVaSourceCurrency(va: BridgeVirtualAccount): "usd" | "eur" | "gbp" | null {
  const src = String(va.source_deposit_instructions?.currency ?? "").trim().toLowerCase()
  if (src === "usd" || src === "eur" || src === "gbp") return src
  const dest = String(va.destination?.currency ?? "").trim().toLowerCase()
  if (dest === "usdc" || dest === "usd") return "usd"
  if (dest === "eurc" || dest === "eur") return "eur"
  return null
}

export function isBridgeVaLinkedToTurnkeyVault(
  va: BridgeVirtualAccount,
  vault: { vaultAddress: string; destCurrency: "usdc" | "eurc" },
): boolean {
  const dest = String(va.destination?.address ?? "").trim()
  const rail = String(va.destination?.payment_rail ?? "").trim().toLowerCase()
  const currency = String(va.destination?.currency ?? "").trim().toLowerCase()
  return (
    Boolean(dest) &&
    dest === vault.vaultAddress &&
    rail === "solana" &&
    currency === vault.destCurrency
  )
}

export async function updateBridgeVirtualAccountDestination(input: {
  customerId: string
  virtualAccountId: string
  destCurrency: "usdc" | "eurc"
  vaultAddress: string
}): Promise<BridgeVirtualAccount> {
  return bridgeFetch<BridgeVirtualAccount>({
    method: "PUT",
    path: `/customers/${encodeURIComponent(input.customerId)}/virtual_accounts/${encodeURIComponent(input.virtualAccountId)}`,
    json: {
      destination: {
        payment_rail: "solana",
        currency: input.destCurrency,
        address: input.vaultAddress,
      },
    },
  })
}

export async function createBridgeVirtualAccount(input: {
  admin: SupabaseClient
  customerId: string
  userId: string
  businessId: string | null
  sourceCurrency: "usd" | "eur"
  idempotencyKey: string
}): Promise<BridgeVirtualAccount> {
  const asset = input.sourceCurrency === "eur" ? "EURC" : "USDC"
  const destCurrency = input.sourceCurrency === "eur" ? "eurc" : "usdc"
  const vault = await resolveTurnkeyVault({
    admin: input.admin,
    userId: input.userId,
    businessId: input.businessId,
    asset,
  })
  if (!vault) {
    throw new Error(`Turnkey ${asset} vault is not ready for Bridge virtual account`)
  }
  if (vault.subOrgId) {
    await ensureStablecoinTokenAccountOnChain({
      subOrgId: vault.subOrgId,
      vaultAddress: vault.vaultAddress,
      asset,
      admin: input.admin,
    })
  }
  return createBridgeVirtualAccountForVault({
    customerId: input.customerId,
    sourceCurrency: input.sourceCurrency,
    vaultAddress: vault.vaultAddress,
    destCurrency,
    idempotencyKey: input.idempotencyKey,
  })
}

export async function createBridgeVirtualAccountForVault(input: {
  customerId: string
  sourceCurrency: "usd" | "eur"
  vaultAddress: string
  destCurrency: "usdc" | "eurc"
  idempotencyKey: string
}): Promise<BridgeVirtualAccount> {
  return bridgeFetch<BridgeVirtualAccount>({
    method: "POST",
    path: `/customers/${encodeURIComponent(input.customerId)}/virtual_accounts`,
    idempotencyKey: input.idempotencyKey,
    json: {
      source: { currency: input.sourceCurrency },
      destination: {
        payment_rail: "solana",
        currency: input.destCurrency,
        address: input.vaultAddress,
      },
    },
  })
}

export async function listBridgeVirtualAccounts(customerId: string): Promise<BridgeVirtualAccount[]> {
  const res = await bridgeFetch<{ data?: BridgeVirtualAccount[] } | BridgeVirtualAccount[]>({
    method: "GET",
    path: `/customers/${encodeURIComponent(customerId)}/virtual_accounts`,
  })
  if (Array.isArray(res)) return res
  return Array.isArray(res.data) ? res.data : []
}
