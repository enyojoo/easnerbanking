import type { SupabaseClient } from "@supabase/supabase-js"
import { isRelayTronInboundEnabled } from "@/lib/relay/config"
import { enqueueRelayDepositProvisionJob, processRelayDepositProvisionJobs } from "./provision-jobs"

const ROUTE = "tron_usdt_to_sol_usdc"

export type RelayDepositAddressPublic = {
  asset: "USDT"
  network: "Tron"
  address: string
  estimatedFeeBps: number | null
}

export type RelayDepositAddressesPayload = {
  enabled: boolean
  status: "active" | "provisioning" | "unavailable"
  addresses: RelayDepositAddressPublic[]
}

export function buildRelayDepositAddressesPayload(input: {
  enabled: boolean
  tronAddress?: string | null
  addressStatus?: string | null
  estimatedFeeBps?: number | null
}): RelayDepositAddressesPayload {
  if (!input.enabled) {
    return { enabled: false, status: "unavailable", addresses: [] }
  }
  const address = String(input.tronAddress ?? "").trim()
  if (input.addressStatus === "active" && address) {
    return {
      enabled: true,
      status: "active",
      addresses: [
        {
          asset: "USDT",
          network: "Tron",
          address,
          estimatedFeeBps: input.estimatedFeeBps ?? null,
        },
      ],
    }
  }
  return {
    enabled: true,
    // Show USDT on Receive even before the Tron address exists.
    status: "provisioning",
    addresses: [],
  }
}

/**
 * Issue (or return) the Relay Tron USDT deposit address for a wallet owner.
 * Receive used to only read; users with a USDC vault but no job never saw USDT.
 */
export async function ensureRelayTronUsdtDepositAddress(
  admin: SupabaseClient,
  walletOwnerId: string,
): Promise<RelayDepositAddressesPayload> {
  if (!isRelayTronInboundEnabled()) {
    return { enabled: false, status: "unavailable", addresses: [] }
  }

  const ownerId = String(walletOwnerId ?? "").trim()
  if (!ownerId) {
    return { enabled: true, status: "provisioning", addresses: [] }
  }

  const { data: vault } = await admin
    .from("wallet_accounts")
    .select("address")
    .eq("wallet_owner_id", ownerId)
    .eq("chain", "solana")
    .eq("asset", "USDC")
    .eq("status", "active")
    .maybeSingle()

  const vaultAddress = String(vault?.address ?? "").trim()
  if (vaultAddress) {
    try {
      await enqueueRelayDepositProvisionJob(admin, {
        walletOwnerId: ownerId,
        recipientVaultAddress: vaultAddress,
      })
      await processRelayDepositProvisionJobs(admin, 3, { walletOwnerId: ownerId })
    } catch (error) {
      console.warn("[relay-deposit] ensure Tron USDT:", error)
    }
  }

  const { data: addr } = await admin
    .from("relay_deposit_addresses")
    .select("tron_address, status, estimated_fee_bps")
    .eq("wallet_owner_id", ownerId)
    .eq("route", ROUTE)
    .maybeSingle()

  return buildRelayDepositAddressesPayload({
    enabled: true,
    tronAddress: addr?.tron_address,
    addressStatus: addr?.status,
    estimatedFeeBps: typeof addr?.estimated_fee_bps === "number" ? addr.estimated_fee_bps : null,
  })
}
