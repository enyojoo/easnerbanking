import type { SupabaseClient } from "@supabase/supabase-js"
import { relayGetRequestV3 } from "@/lib/relay/client"
import {
  extractRelayRequestId,
  extractRelaySolanaUnsignedTx,
  parseRelayFromAmountRaw,
} from "@/lib/relay/quote"
import {
  extractRelayOutTxHashesV3,
  isRelayRequestTerminalV3,
  mapRelayRequestStatusV3,
} from "@/lib/relay/requests-v3"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/relay/token-map"
import { getTurnkeySolanaBroadcastCaip2, isTurnkeySolSponsorshipEnabled } from "@/lib/turnkey/config"
import { resolveTurnkeySendClient } from "@/lib/turnkey/resolve-send-client"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import { isBridgeExecutionModel } from "./routing"
import type { WalletSendSessionRow } from "./wallet-send-session"
import { parseRelayToAmountHumanFromQuote } from "./relay-from-amount"
import { meetsRelayReceiveTarget } from "./relay-receive-search"
import { quoteRelayWalletBridge, quoteRelayWalletBridgeFromAmountRaw } from "./relay-wallet-quote"

export async function executeRelayWalletSend(input: {
  admin: SupabaseClient
  ctx: NoahAccountContext
  session: WalletSendSessionRow
  feeAddress: string
  easnerTransactionId: string
}): Promise<
  | {
      ok: true
      providerTransactionId: string
      status: "pending" | "settled" | "failed"
      txHash?: string | null
      relayRequestId?: string
    }
  | { ok: false; error: string }
> {
  if (!isBridgeExecutionModel(input.session.execution_model)) {
    return { ok: false, error: "not_relay_bridge_session" }
  }

  const balanceCurrency = input.session.source_balance_currency as "USD" | "EUR"
  const source = sourceSolVaultToken(balanceCurrency)
  const dest = resolveWalletSendToken(input.session.receive_asset, input.session.receive_network)
  if (!dest) return { ok: false, error: "unsupported_corridor" }

  const fromAddress = await resolveTurnkeyAddressForNoahPair(
    input.admin,
    input.ctx,
    source.asset,
    "Solana",
  )
  if (!fromAddress) return { ok: false, error: "no_source_vault" }

  const slippage = 0.03
  const slippageTolerance = String(Math.round(slippage * 10_000))
  const storedFromAmountRaw = String(input.session.relay_from_amount_raw ?? "").trim()

  let quote
  try {
    if (storedFromAmountRaw) {
      quote = await quoteRelayWalletBridgeFromAmountRaw({
        user: fromAddress,
        recipient: input.session.destination_address,
        source,
        dest,
        fromAmountRaw: storedFromAmountRaw,
        slippageTolerance,
      })
      const toHuman = parseRelayToAmountHumanFromQuote(quote, dest.decimals)
      if (!meetsRelayReceiveTarget(toHuman, input.session.receive_amount, slippage)) {
        return { ok: false, error: "relay_receive_target_not_met" }
      }
    } else {
      quote = await quoteRelayWalletBridge({
        source,
        dest,
        fromAddress,
        toAddress: input.session.destination_address,
        amountEntryMode: "receive",
        receiveAmount: input.session.receive_amount,
        customerRate: input.session.customer_rate,
        bridgeMid: input.session.relay_mid,
        slippage,
      })
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "relay_quote_failed" }
  }

  let execFloor: number
  try {
    const fromRaw = parseRelayFromAmountRaw(quote)
    execFloor = Number(fromRaw) / 10 ** source.decimals
  } catch {
    return { ok: false, error: "relay_quote_missing_from_amount" }
  }

  const sessionFloor = input.session.relay_floor
  if (Number.isFinite(sessionFloor) && sessionFloor > 0 && execFloor > sessionFloor * 1.02) {
    return { ok: false, error: "relay_floor_exceeded" }
  }

  const subOrgId = await resolveSubOrgId(input.admin, input.ctx)
  if (!subOrgId) return { ok: false, error: "no_turnkey_suborg" }

  const resolved = await resolveTurnkeySendClient({
    scope: { kind: "sub_org", subOrganizationId: subOrgId },
    admin: input.admin,
  })
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const client = resolved.client
  if (!client.solSendTransaction) return { ok: false, error: "turnkey_not_configured" }

  let unsigned: string
  try {
    unsigned = extractRelaySolanaUnsignedTx(quote)
  } catch {
    return { ok: false, error: "relay_missing_solana_transaction" }
  }

  const sponsor = isTurnkeySolSponsorshipEnabled()
  const caip2 = getTurnkeySolanaBroadcastCaip2()

  let sendRes: Record<string, unknown>
  try {
    sendRes = (await client.solSendTransaction({
      type: "ACTIVITY_TYPE_SIGN_AND_BROADCAST_TRANSACTION",
      organizationId: subOrgId,
      parameters: {
        signWith: fromAddress,
        unsignedTransaction: unsigned,
        type: "TRANSACTION_TYPE_SOLANA",
        caip2,
        sponsor,
      },
    })) as Record<string, unknown>
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "relay_sign_failed" }
  }

  const relayRequestId =
    extractRelayRequestId(quote) ??
    (String(input.session.relay_quote_id ?? "").trim() || undefined)

  const providerTransactionId = String(
    (sendRes as { sendTransactionStatusId?: string }).sendTransactionStatusId ||
      relayRequestId ||
      input.session.form_session_id,
  )

  const txHash =
    String(sendRes.signature ?? sendRes.txHash ?? sendRes.transactionHash ?? "").trim() || null

  if (relayRequestId) {
    try {
      const req = await relayGetRequestV3(relayRequestId)
      if (req && isRelayRequestTerminalV3(String(req.status))) {
        const mapped = mapRelayRequestStatusV3(String(req.status))
        const fillHashes = extractRelayOutTxHashesV3(req)
        return {
          ok: true,
          providerTransactionId,
          status: mapped,
          txHash: fillHashes[0] ?? txHash,
          relayRequestId,
        }
      }
    } catch {
      /* poll later */
    }
  }

  return {
    ok: true,
    providerTransactionId,
    status: "pending",
    txHash,
    relayRequestId,
  }
}

async function resolveSubOrgId(admin: SupabaseClient, ctx: NoahAccountContext): Promise<string | null> {
  const { resolveWalletOwnerIdForEasnerContext } = await import("@/lib/wallet/resolve-wallet-owner")
  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, ctx)
  if (!ownerId) return null
  const { data } = await admin
    .from("wallet_owners")
    .select("turnkey_sub_organization_id")
    .eq("id", ownerId)
    .maybeSingle()
  return String(data?.turnkey_sub_organization_id || "").trim() || null
}
