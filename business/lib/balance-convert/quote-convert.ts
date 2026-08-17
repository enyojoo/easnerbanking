import type { SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import {
  BALANCE_CONVERT_MIN_SOURCE_AMOUNT,
  buildBalanceMoveReviewSnapshot,
} from "@easner/shared"
import { relayQuote } from "@/lib/relay/quote"
import { parseRelayFromAmountRaw, parseRelayToAmountHuman } from "@/lib/relay/quote"
import { sourceSolVaultToken } from "@/lib/relay/token-map"
import { isRelayConfigured } from "@/lib/relay/config"
import { buildMoveReviewFromQuote } from "./build-move-review"

export type BalanceConvertDirection = "usd_to_eur" | "eur_to_usd"

const CONVERT_TTL_MS = 5 * 60 * 1000

export type BalanceConvertQuoteResult = {
  sessionId: string
  sourceAmount: number
  destinationAmount: number
  expiresAt: string
  rate: number
  processingFee: number
  totalDebited: number
  moveReview: ReturnType<typeof buildBalanceMoveReviewSnapshot>
}

export async function quoteBalanceConvert(input: {
  admin: SupabaseClient
  walletOwnerId: string
  userId: string
  direction: BalanceConvertDirection
  sourceAmount: number
  fromAddress: string
}): Promise<BalanceConvertQuoteResult> {
  if (!isRelayConfigured()) throw new Error("relay_not_configured")
  if (!Number.isFinite(input.sourceAmount) || input.sourceAmount <= 0) {
    throw new Error("source_amount_invalid")
  }
  if (input.sourceAmount < BALANCE_CONVERT_MIN_SOURCE_AMOUNT) {
    throw new Error("min_amount_not_met")
  }

  const source =
    input.direction === "usd_to_eur"
      ? sourceSolVaultToken("USD")
      : sourceSolVaultToken("EUR")
  const dest =
    input.direction === "usd_to_eur"
      ? sourceSolVaultToken("EUR")
      : sourceSolVaultToken("USD")

  const amountRaw = String(Math.round(input.sourceAmount * 10 ** source.decimals))
  const quote = await relayQuote({
    user: input.fromAddress,
    recipient: input.fromAddress,
    source,
    dest,
    amountRaw,
    tradeType: "EXACT_INPUT",
  })

  const destinationAmount = parseRelayToAmountHuman(quote, dest.decimals)
  const moveReview = buildMoveReviewFromQuote({
    direction: input.direction,
    sourceAmount: input.sourceAmount,
    destinationAmount,
    quote,
  })
  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + CONVERT_TTL_MS).toISOString()

  await input.admin.from("balance_convert_sessions").insert({
    id: sessionId,
    wallet_owner_id: input.walletOwnerId,
    user_id: input.userId,
    direction: input.direction,
    source_amount: input.sourceAmount,
    destination_amount: destinationAmount,
    relay_request_id: quote.requestId ?? quote.id ?? null,
    status: "quoted",
    metadata: {
      relay_from_amount_raw: parseRelayFromAmountRaw(quote),
      move_review: moveReview,
    },
    expires_at: expiresAt,
  })

  return {
    sessionId,
    sourceAmount: input.sourceAmount,
    destinationAmount,
    expiresAt,
    rate: moveReview.exchange_rate,
    processingFee: moveReview.processing_fee,
    totalDebited: moveReview.total_debited,
    moveReview,
  }
}

export async function getBalanceConvertSession(
  admin: SupabaseClient,
  sessionId: string,
  userId: string,
) {
  const { data } = await admin
    .from("balance_convert_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle()
  return data
}

export { CONVERT_TTL_MS }
