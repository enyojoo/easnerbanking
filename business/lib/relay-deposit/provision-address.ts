import type { SupabaseClient } from "@supabase/supabase-js"
import { relayQuote } from "@/lib/relay/quote"
import { extractRelayDepositAddress, extractRelayRequestId } from "@/lib/relay/quote"
import { parseRelayFeesV3 } from "@/lib/relay/requests-v3"
import { relayGetRequestV3 } from "@/lib/relay/client"
import { requireRelayTronPlatformAddress } from "@/lib/relay/config"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/relay/token-map"

const ROUTE = "tron_usdt_to_sol_usdc"

export async function provisionRelayDepositAddress(
  admin: SupabaseClient,
  input: { walletOwnerId: string; recipientVaultAta: string },
): Promise<{ tronAddress: string; relayRequestId?: string }> {
  const walletOwnerId = String(input.walletOwnerId || "").trim()
  const recipientVaultAta = String(input.recipientVaultAta || "").trim()
  if (!walletOwnerId || !recipientVaultAta) {
    throw new Error("relay_deposit_provision_invalid_input")
  }

  const source = resolveWalletSendToken("USDT", "Tron")
  const dest = sourceSolVaultToken("USD")
  if (!source || !dest) throw new Error("relay_deposit_token_map")

  const tronPlatform = requireRelayTronPlatformAddress()

  // Origin is Tron: Relay validates `user` on Tron. Customer receives USDC on Solana vault (`recipient`).
  const quote = await relayQuote({
    user: tronPlatform,
    recipient: recipientVaultAta,
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

  await admin.from("relay_deposit_addresses").upsert(
    {
      wallet_owner_id: walletOwnerId,
      route: ROUTE,
      tron_address: tronAddress,
      recipient_vault_ata: recipientVaultAta,
      relay_request_id: relayRequestId ?? null,
      estimated_fee_bps: estimatedFeeBps,
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "wallet_owner_id,route" },
  )

  return { tronAddress, relayRequestId: relayRequestId ?? undefined }
}
