import type { PayoutRail } from "./payout-corridor"
import {
  YC_RECEIVE_LIMITS_FALLBACK,
  YC_SEND_LIMITS_FALLBACK,
  ycCorridorLimitKey,
} from "./yc-corridor-limit-fallbacks"
import { getYcBusinessPayInMin, type YcPayInLimits } from "./yc-pay-in-limits"
import {
  getYcBusinessPayoutMin,
  YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE,
  type YcPayoutLimits,
} from "./yc-payout-limits"

function mergeMin(
  channelMin: number | null,
  fallbackMin: number | undefined,
  businessMin: number | null,
): number | null {
  const candidates = [channelMin, fallbackMin, businessMin].filter(
    (n): n is number => n != null && Number.isFinite(n) && n > 0,
  )
  if (!candidates.length) return null
  return Math.max(...candidates)
}

/**
 * Grid pay-in limits when Grid API does not publish channel min/max.
 * Uses the same corridor fallbacks and business floors as Yellowcard receive.
 */
export function resolveGridPayInLimits(input: {
  country: string
  currency: string
  rail: PayoutRail
}): YcPayInLimits {
  const fallback =
    YC_RECEIVE_LIMITS_FALLBACK[
      ycCorridorLimitKey(input.country, input.currency, input.rail)
    ]
  const businessMin = getYcBusinessPayInMin(input.currency, input.rail)

  return {
    minLocalPayIn: mergeMin(null, fallback?.min, businessMin),
    maxLocalPayIn: fallback?.max ?? null,
  }
}

/**
 * Grid balance payout limits when Grid API does not publish channel min/max.
 * Uses the same corridor fallbacks and business floors as Yellowcard send.
 */
export function resolveGridPayoutLimits(input: {
  country: string
  currency: string
  rail: PayoutRail
}): YcPayoutLimits {
  const fallback =
    YC_SEND_LIMITS_FALLBACK[ycCorridorLimitKey(input.country, input.currency, input.rail)]
  const businessMin = getYcBusinessPayoutMin(input.currency, input.rail)

  return {
    minSendUsd: YC_DIRECT_SETTLEMENT_MIN_SEND_USDC_EXCLUSIVE,
    minLocalReceive: mergeMin(null, fallback?.min, businessMin),
    maxLocalReceive: fallback?.max ?? null,
  }
}
