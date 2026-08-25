import type { SupabaseClient } from "@supabase/supabase-js"
import { parseRelayFromAmountRaw, relayQuote, resolveRelaySolanaUnsignedTxHexForTurnkey } from "@/lib/relay/quote"
import { getTurnkeySolanaBroadcastCaip2, isTurnkeySolSponsorshipEnabled } from "@/lib/turnkey/config"
import { resolveTurnkeySendClient } from "@/lib/turnkey/resolve-send-client"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import { sourceSolVaultToken } from "@/lib/relay/token-map"
import { getBalanceConvertSession } from "./quote-convert"
import { settleBalanceConvertByRelayRequestId } from "./settle-convert"
import { upsertBalanceConvertLedgerTransaction } from "./balance-move-ledger"
import { buildMoveReviewFromQuote } from "./build-move-review"
import type { BalanceConvertDirection } from "./quote-convert"

export async function executeBalanceConvert(input: {
  admin: SupabaseClient
  ctx: NoahAccountContext
  userId: string
  businessId: string | null
  sessionId: string
  subOrganizationId: string
}): Promise<
  | {
      ok: true
      status: "pending" | "settled" | "failed"
      relayRequestId?: string
      transactionId?: string
    }
  | { ok: false; error: string }
> {
  const session = await getBalanceConvertSession(input.admin, input.sessionId, input.userId)
  if (!session) return { ok: false, error: "convert_session_not_found" }
  if (String(session.status) !== "quoted") return { ok: false, error: "convert_session_not_quoted" }
  if (new Date(String(session.expires_at)).getTime() < Date.now()) {
    return { ok: false, error: "convert_session_expired" }
  }

  const direction = String(session.direction) as BalanceConvertDirection
  const sourceCurrency = direction === "usd_to_eur" ? "USD" : "EUR"
  const destCurrency = direction === "usd_to_eur" ? "EUR" : "USD"
  const source = sourceSolVaultToken(sourceCurrency as "USD" | "EUR")
  const dest = sourceSolVaultToken(destCurrency as "USD" | "EUR")

  const fromAddress = await resolveTurnkeyAddressForNoahPair(
    input.admin,
    input.ctx,
    source.asset,
    "Solana",
  )
  if (!fromAddress) return { ok: false, error: "no_source_vault" }

  const meta = (session.metadata ?? {}) as Record<string, unknown>
  const storedRaw = String(meta.relay_from_amount_raw ?? "").trim()
  const amountRaw =
    storedRaw ||
    String(Math.round(Number(session.source_amount) * 10 ** source.decimals))

  const quote = await relayQuote({
    user: fromAddress,
    recipient: fromAddress,
    source,
    dest,
    amountRaw,
    tradeType: "EXACT_INPUT",
  })

  const destinationAmount = Number(session.destination_amount ?? 0)
  const moveReview = buildMoveReviewFromQuote({
    direction,
    sourceAmount: Number(session.source_amount),
    destinationAmount:
      Number.isFinite(destinationAmount) && destinationAmount > 0
        ? destinationAmount
        : Number(session.source_amount),
    quote,
  })

  const resolved = await resolveTurnkeySendClient({
    scope: { kind: "sub_org", subOrganizationId: input.subOrganizationId },
    admin: input.admin,
  })
  if (!resolved.ok) return { ok: false, error: resolved.error }
  if (!resolved.client.solSendTransaction) return { ok: false, error: "turnkey_not_configured" }

  let unsigned: string
  try {
    unsigned = await resolveRelaySolanaUnsignedTxHexForTurnkey({
      quote,
      feePayer: fromAddress,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "relay_missing_solana_transaction" }
  }

  await resolved.client.solSendTransaction({
    type: "ACTIVITY_TYPE_SIGN_AND_BROADCAST_TRANSACTION",
    organizationId: input.subOrganizationId,
    parameters: {
      signWith: fromAddress,
      unsignedTransaction: unsigned,
      type: "TRANSACTION_TYPE_SOLANA",
      caip2: getTurnkeySolanaBroadcastCaip2(),
      sponsor: isTurnkeySolSponsorshipEnabled(),
    },
  })

  const relayRequestId = String(quote.requestId ?? quote.id ?? session.relay_request_id ?? "").trim()
  parseRelayFromAmountRaw(quote)

  await input.admin
    .from("balance_convert_sessions")
    .update({
      status: "executed",
      relay_request_id: relayRequestId || null,
      destination_amount: moveReview.destination_amount,
      metadata: {
        ...meta,
        move_review: moveReview,
        relay_from_amount_raw: parseRelayFromAmountRaw(quote),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.sessionId)

  const sessionRow = {
    id: String(session.id),
    wallet_owner_id: String(session.wallet_owner_id),
    user_id: String(session.user_id),
    direction: String(session.direction),
    source_amount: Number(session.source_amount),
    destination_amount: moveReview.destination_amount,
    relay_request_id: relayRequestId || null,
    metadata: { ...meta, move_review: moveReview },
  }

  const pendingLedger = await upsertBalanceConvertLedgerTransaction(input.admin, {
    session: sessionRow,
    scope: { userId: input.userId, businessId: input.businessId },
    status: "pending",
  })

  if (relayRequestId) {
    const settled = await settleBalanceConvertByRelayRequestId(input.admin, { relayRequestId })
    if (settled.settled) {
      return {
        ok: true,
        status: settled.action === "convert_settled" ? "settled" : "failed",
        relayRequestId,
        transactionId: pendingLedger.transactionId,
      }
    }
  }

  return {
    ok: true,
    status: "pending",
    relayRequestId: relayRequestId || undefined,
    transactionId: pendingLedger.transactionId,
  }
}
