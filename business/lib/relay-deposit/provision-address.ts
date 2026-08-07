import type { SupabaseClient } from "@supabase/supabase-js"
import { relayQuote } from "@/lib/relay/quote"
import { extractRelayDepositAddress, extractRelayRequestId } from "@/lib/relay/quote"
import { parseRelayFeesV3 } from "@/lib/relay/requests-v3"
import { relayGetRequestV3 } from "@/lib/relay/client"
import { requireRelayTronPlatformAddress } from "@/lib/relay/config"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/relay/token-map"
import { relayDepositRecipientFromVault } from "./recipient"
import { ensureWalletAccountSplAta } from "./ensure-wallet-ata"

const ROUTE = "tron_usdt_to_sol_usdc"

export async function provisionRelayDepositAddress(
  admin: SupabaseClient,
  input: { walletOwnerId: string; recipientVaultAddress: string },
): Promise<{ tronAddress: string; relayRequestId?: string }> {
  const walletOwnerId = String(input.walletOwnerId || "").trim()
  const recipientVaultAddress = relayDepositRecipientFromVault(input.recipientVaultAddress)
  if (!walletOwnerId || !recipientVaultAddress) {
    throw new Error("relay_deposit_provision_invalid_input")
  }

  await ensureWalletAccountSplAta(admin, {
    walletOwnerId,
    vaultAddress: recipientVaultAddress,
    asset: "USDC",
  })

  const source = resolveWalletSendToken("USDT", "Tron")
  const dest = sourceSolVaultToken("USD")
  if (!source || !dest) throw new Error("relay_deposit_token_map")

  const tronPlatform = requireRelayTronPlatformAddress()

  // Origin is Tron: Relay validates `user` on Tron. Customer receives USDC on the vault
  // pubkey so Relay funds the canonical SPL ATA (owner = vault), same as Noah/Grid.
  const quote = await relayQuote({
    user: tronPlatform,
    recipient: recipientVaultAddress,
    source,
    dest,
    amountRaw: "1000000",
    tradeType: "EXACT_INPUT",
    useDepositAddress: true,
    refundTo: tronPlatform,
  })

  const tronAddress = extractRelayDepositAddress(quote)
  if (!tronAddress) throw new Error("relay_deposit_address_missing")

  const relayRequestId = extractRelayRequestId(quote)
  let estimatedFeeBps: number | null = null
  if (relayRequestId) {
    const req = await relayGetRequestV3(relayRequestId)
    if (req) {
      const fees = parseRelayFeesV3(req)
      if (fees.quotedUsd > 0) {
        estimatedFeeBps = Math.round((fees.quotedUsd / 1) * 10_000)
      }
    }
  }

  const { data: existingRow } = await admin
    .from("relay_deposit_addresses")
    .select("tron_address, relay_request_id, recipient_vault_ata, metadata")
    .eq("wallet_owner_id", walletOwnerId)
    .eq("route", ROUTE)
    .maybeSingle()

  const existingMeta =
    existingRow?.metadata && typeof existingRow.metadata === "object"
      ? (existingRow.metadata as Record<string, unknown>)
      : {}
  const retiredTronAddresses = Array.isArray(existingMeta.retired_tron_addresses)
    ? (existingMeta.retired_tron_addresses as Array<Record<string, unknown>>)
    : []
  const priorTron = String(existingRow?.tron_address ?? "").trim()
  const priorRecipient = String(existingRow?.recipient_vault_ata ?? "").trim()
  if (
    priorTron &&
    priorTron !== tronAddress &&
    priorRecipient &&
    priorRecipient !== recipientVaultAddress
  ) {
    retiredTronAddresses.push({
      tron_address: priorTron,
      relay_request_id: existingRow?.relay_request_id ?? null,
      recipient: priorRecipient,
      retired_at: new Date().toISOString(),
      reason: "recipient_vault_reprovision",
    })
  }

  await admin.from("relay_deposit_addresses").upsert(
    {
      wallet_owner_id: walletOwnerId,
      route: ROUTE,
      tron_address: tronAddress,
      recipient_vault_ata: recipientVaultAddress,
      relay_request_id: relayRequestId ?? null,
      estimated_fee_bps: estimatedFeeBps,
      status: "active",
      metadata: {
        ...existingMeta,
        recipient_kind: "vault_pubkey",
        ...(retiredTronAddresses.length ? { retired_tron_addresses: retiredTronAddresses } : {}),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "wallet_owner_id,route" },
  )

  return { tronAddress, relayRequestId: relayRequestId ?? undefined }
}
