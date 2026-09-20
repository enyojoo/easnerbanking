import type { SupabaseClient } from "@supabase/supabase-js"
import { Connection } from "@solana/web3.js"
import { getTurnkeySolanaBroadcastCaip2, isTurnkeySolSponsorshipEnabled } from "@/lib/turnkey/config"
import { resolveTurnkeySendClient } from "@/lib/turnkey/resolve-send-client"
import { buildStablecoinSplTransferUnsignedTxPayloadForTurnkey, getSolanaRpcUrl } from "@/lib/turnkey/sol-spl-transfer-unsigned-tx"
import type { TurnkeyClientLike } from "@/lib/turnkey/sol-send-polling"

function railError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

export async function sendStablecoinFromWalletOwner(
  admin: SupabaseClient,
  input: {
    walletOwnerId: string
    asset: "USDC" | "EURC"
    destinationAddress: string
    amount: number
  },
): Promise<void> {
  const { data: owner } = await admin
    .from("wallet_owners")
    .select("turnkey_sub_organization_id")
    .eq("id", input.walletOwnerId)
    .maybeSingle()
  const subOrgId = String(owner?.turnkey_sub_organization_id ?? "").trim()
  if (!subOrgId) throw railError("not_available", "Customer vault is not ready")
  const { data: wallet } = await admin
    .from("wallet_accounts")
    .select("address")
    .eq("wallet_owner_id", input.walletOwnerId)
    .eq("status", "active")
    .eq("chain", "solana")
    .eq("asset", input.asset)
    .maybeSingle()
  const sourceAddress = String(wallet?.address ?? "").trim()
  if (!sourceAddress) throw railError("not_available", "Customer vault is not ready")

  const resolved = await resolveTurnkeySendClient({
    scope: { kind: "sub_org", subOrganizationId: subOrgId },
    admin,
  })
  if (!resolved.ok) throw railError("not_available", resolved.error)
  const client = resolved.client as TurnkeyClientLike
  if (typeof client.solSendTransaction !== "function") {
    throw railError("not_available", "Could not send from the vault")
  }
  const sponsor = isTurnkeySolSponsorshipEnabled()
  const connection = new Connection(getSolanaRpcUrl(), "confirmed")
  const { blockhash } = await connection.getLatestBlockhash("finalized")
  const unsignedTransaction = await buildStablecoinSplTransferUnsignedTxPayloadForTurnkey({
    asset: input.asset,
    ownerAddress: sourceAddress,
    destinationAddress: input.destinationAddress,
    amountHuman: input.amount,
    sponsoredFlow: sponsor,
    recentBlockhash: blockhash,
  })
  await client.solSendTransaction({
    organizationId: subOrgId,
    unsignedTransaction,
    signWith: sourceAddress,
    caip2: getTurnkeySolanaBroadcastCaip2(),
    ...(sponsor ? { sponsor: true, recentBlockhash: blockhash } : {}),
  })
}
