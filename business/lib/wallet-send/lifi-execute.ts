import type { SupabaseClient } from "@supabase/supabase-js"
import { getTurnkeyApiClientForSubOrganization } from "@/lib/turnkey/client"
import { getTurnkeySolanaBroadcastCaip2, isTurnkeySolSponsorshipEnabled } from "@/lib/turnkey/config"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { lifiQuote, lifiGetStatus } from "@/lib/lifi/client"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/lifi/token-map"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import type { WalletSendSessionRow } from "./wallet-send-session"
import { estimateLifiFromAmountRaw } from "./lifi-from-amount"

type TurnkeyClientLike = Record<string, (...args: unknown[]) => Promise<unknown>>

export async function executeLifiWalletSend(input: {
  admin: SupabaseClient
  ctx: NoahAccountContext
  session: WalletSendSessionRow
  easnerTransactionId: string
  reviewSnapshot?: Record<string, unknown>
}): Promise<
  | { ok: true; providerTransactionId: string; status: "pending" | "settled" | "failed"; txHash?: string | null }
  | { ok: false; error: string }
> {
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

  const fromAmountRaw = estimateLifiFromAmountRaw({
    receiveAmount: input.session.receive_amount,
    customerRate: input.session.customer_rate,
    lifiMid: input.session.lifi_mid,
    sourceDecimals: source.decimals,
  })

  let quote
  try {
    quote = await lifiQuote({
      fromChain: source.chainId,
      toChain: dest.chainId,
      fromToken: source.address,
      toToken: dest.address,
      fromAddress,
      toAddress: input.session.destination_address,
      fromAmount: fromAmountRaw,
      fee: 0,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "lifi_quote_failed" }
  }

  const fromRaw = Number(quote.estimate?.fromAmount ?? 0)
  const execFloor = fromRaw / 10 ** source.decimals
  const sessionFloor = input.session.lifi_floor
  if (Number.isFinite(sessionFloor) && sessionFloor > 0 && execFloor > sessionFloor * 1.02) {
    return { ok: false, error: "lifi_floor_exceeded" }
  }

  const owner = fromAddress

  const subOrgId = await resolveSubOrgId(input.admin, input.ctx)
  if (!subOrgId) return { ok: false, error: "no_turnkey_suborg" }

  const client = getTurnkeyApiClientForSubOrganization(subOrgId) as TurnkeyClientLike | null
  if (!client?.solSendTransaction) return { ok: false, error: "turnkey_not_configured" }

  const txReq = quote.transactionRequest as Record<string, unknown> | undefined
  const unsigned = String(txReq?.data ?? "").trim()
  if (!unsigned) {
    return { ok: false, error: "lifi_missing_transaction_request" }
  }

  const sponsor = isTurnkeySolSponsorshipEnabled()
  const caip2 = getTurnkeySolanaBroadcastCaip2()

  let sendRes: Record<string, unknown>
  try {
    sendRes = (await client.solSendTransaction({
      type: "ACTIVITY_TYPE_SIGN_AND_BROADCAST_TRANSACTION",
      organizationId: subOrgId,
      parameters: {
        signWith: owner,
        unsignedTransaction: unsigned,
        type: "TRANSACTION_TYPE_SOLANA",
        caip2,
        sponsor,
      },
    })) as Record<string, unknown>
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "lifi_sign_failed" }
  }

  const providerTransactionId = String(
    (sendRes as { sendTransactionStatusId?: string }).sendTransactionStatusId ||
      quote.id ||
      input.session.form_session_id,
  )

  const txHash =
    String(sendRes.signature ?? sendRes.txHash ?? sendRes.transactionHash ?? "").trim() || null

  await upsertLedgerTransaction(input.admin, {
    userId: input.session.user_id,
    provider: "lifi",
    providerTransactionId,
    status: "pending",
    amount: input.session.total_debited,
    currency: balanceCurrency,
    direction: "out",
    txHash,
    counterpartyAddress: input.session.destination_address,
    asset: input.session.receive_asset,
    chain: input.session.receive_network,
    metadata: {
      activity_type: "wallet_send",
      execution_model: "lifi_bridge",
      receive_asset: input.session.receive_asset,
      receive_network: input.session.receive_network,
      receive_amount: input.session.receive_amount,
      lifi_tool: quote.tool,
      lifi_quote_id: quote.id,
      form_session_id: input.session.form_session_id,
      easner_transaction_id: input.easnerTransactionId,
      ...(input.reviewSnapshot ?? {}),
    },
  })

  if (txHash) {
    try {
      const status = await lifiGetStatus(txHash, quote.tool)
      if (status.status === "DONE") {
        return { ok: true, providerTransactionId, status: "settled", txHash }
      }
    } catch {
      /* poll later */
    }
  }

  return { ok: true, providerTransactionId, status: "pending", txHash }
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
