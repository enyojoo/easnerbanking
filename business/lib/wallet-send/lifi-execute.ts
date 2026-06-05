import type { SupabaseClient } from "@supabase/supabase-js"
import { getTurnkeyApiClientForSubOrganization } from "@/lib/turnkey/client"
import { getTurnkeySolanaBroadcastCaip2, isTurnkeySolSponsorshipEnabled } from "@/lib/turnkey/config"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { lifiGetStatus } from "@/lib/lifi/client"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/lifi/token-map"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import type { WalletSendSessionRow } from "./wallet-send-session"
import { quoteLifiWalletBridge } from "./lifi-wallet-quote"

type TurnkeyClientLike = Record<string, (...args: unknown[]) => Promise<unknown>>

const MARGIN_DUST = 0.000_001

export async function executeLifiWalletSend(input: {
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
      marginTurnkeySendId?: string
      lifiTool?: string
      lifiQuoteId?: string
    }
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

  let quote
  try {
    quote = await quoteLifiWalletBridge({
      source,
      dest,
      fromAddress,
      toAddress: input.session.destination_address,
      amountEntryMode: "receive",
      receiveAmount: input.session.receive_amount,
      customerRate: input.session.customer_rate,
      lifiMid: input.session.lifi_mid,
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
        signWith: fromAddress,
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

  const marginAmount = input.session.margin_amount
  const walletSendCtx = { formSessionId: input.session.form_session_id }
  let marginTurnkeySendId: string | undefined

  if (marginAmount > MARGIN_DUST) {
    const asset = source.asset === "EURC" ? "EURC" : "USDC"
    const marginSend = await createTurnkeySend(input.admin, {
      ctx: input.ctx,
      asset,
      chain: "solana",
      destinationAddress: input.feeAddress,
      amount: marginAmount,
      settlementPollTimeoutMs: 0,
      walletSend: { ...walletSendCtx, marginLeg: true },
    })
    marginTurnkeySendId = marginSend.providerTransactionId
    if (marginSend.status === "failed") {
      const detail = marginSend.chainFailureDetail?.trim() || "margin_capture_failed"
      return { ok: false, error: detail || "margin_capture_failed" }
    }
  }

  if (txHash) {
    try {
      const status = await lifiGetStatus(txHash, quote.tool)
      if (status.status === "DONE") {
        return {
          ok: true,
          providerTransactionId,
          status: "settled",
          txHash,
          marginTurnkeySendId,
          lifiTool: quote.tool,
          lifiQuoteId: quote.id,
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
    marginTurnkeySendId,
    lifiTool: quote.tool,
    lifiQuoteId: quote.id,
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
