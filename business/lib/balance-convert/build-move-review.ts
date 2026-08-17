import type { RelayQuoteV2Response } from "@/lib/relay/types"
import { parseRelayNetworkFeeUsd } from "@/lib/relay/quote"
import {
  buildBalanceMoveReviewSnapshot,
  type BalanceMoveDirection,
  type BalanceMoveReviewSnapshot,
} from "@easner/shared"

export function buildMoveReviewFromQuote(input: {
  direction: BalanceMoveDirection
  sourceAmount: number
  destinationAmount: number
  quote: RelayQuoteV2Response
}): BalanceMoveReviewSnapshot {
  const relayFeeUsd = parseRelayNetworkFeeUsd(input.quote)
  const { sourceCurrency } =
    input.direction === "usd_to_eur"
      ? { sourceCurrency: "USD" as const }
      : { sourceCurrency: "EUR" as const }
  const processingFee =
    sourceCurrency === "USD" ? relayFeeUsd : 0
  return buildBalanceMoveReviewSnapshot({
    direction: input.direction,
    sourceAmount: input.sourceAmount,
    destinationAmount: input.destinationAmount,
    processingFee,
  })
}
