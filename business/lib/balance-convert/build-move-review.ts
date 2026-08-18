import type { RelayQuoteV2Response } from "@/lib/relay/types"
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
  void input.quote
  // Match payout/Relay bridge UX: route cost is in the quoted rate/output, not a separate debit row.
  return buildBalanceMoveReviewSnapshot({
    direction: input.direction,
    sourceAmount: input.sourceAmount,
    destinationAmount: input.destinationAmount,
    processingFee: 0,
  })
}
