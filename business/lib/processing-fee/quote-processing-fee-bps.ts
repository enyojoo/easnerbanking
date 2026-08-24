import type { SupabaseClient } from "@supabase/supabase-js"
import type { ProcessingFeeDirection } from "@/lib/admin/processing-fee-schedule-service"
import {
  resolveCryptoProcessingFeeBps,
  resolveExpressDepositsProcessingFeeBps,
  resolveFiatProcessingFeeBps,
  type FiatProcessingFeeRail,
  type ProcessingFeeSubjectContext,
} from "@/lib/processing-fee/resolve-processing-fee-bps"

export type QuoteFiatFeeContext = {
  countryCode: string
  currencyCode: string
  rail: FiatProcessingFeeRail
}

export async function quoteFiatProcessingFeeBps(
  admin: SupabaseClient,
  ctx: QuoteFiatFeeContext,
  direction: ProcessingFeeDirection,
  subject?: ProcessingFeeSubjectContext,
): Promise<number> {
  return resolveFiatProcessingFeeBps(admin, {
    rail: ctx.rail,
    countryCode: ctx.countryCode,
    currencyCode: ctx.currencyCode,
    direction,
    userId: subject?.userId,
    businessId: subject?.businessId,
  })
}

export async function quoteCryptoProcessingFeeBps(
  admin: SupabaseClient,
  assetCode: string,
  direction: Extract<ProcessingFeeDirection, "pay_in" | "pay_out">,
  subject?: ProcessingFeeSubjectContext,
): Promise<number> {
  return resolveCryptoProcessingFeeBps(admin, {
    assetCode,
    direction,
    userId: subject?.userId,
    businessId: subject?.businessId,
  })
}

export async function quoteExpressDepositsProcessingFeeBps(
  admin: SupabaseClient,
  subject?: ProcessingFeeSubjectContext,
): Promise<number> {
  return resolveExpressDepositsProcessingFeeBps(admin, {
    userId: subject?.userId,
    businessId: subject?.businessId,
  })
}

export function recipientPayoutRail(recipient: {
  mobile_provider?: string | null
  bank_name?: string | null
}): FiatProcessingFeeRail {
  return recipient.mobile_provider ||
    String(recipient.bank_name || "").toLowerCase().includes("mobile money")
    ? "mobile_money"
    : "bank_transfer"
}
