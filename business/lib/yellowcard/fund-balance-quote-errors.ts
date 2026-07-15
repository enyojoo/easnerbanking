import { NextResponse } from "next/server"

export type YcFundBalanceQuoteErrorCode =
  | "currency_country_required"
  | "yc_rate_unavailable"
  | "yc_corridor_disabled"
  | "yc_settlement_wallet_not_configured"
  | "yc_channel_missing"
  | "ng_local_verification_incomplete"
  | "kyc_metadata_incomplete"
  | "yc_receive_rejected"

export function ycFundBalanceQuoteError(
  code: YcFundBalanceQuoteErrorCode,
  error: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  console.warn("[yc-fund-balance-quote]", { code, error, ...extra })
  return NextResponse.json({ error, code, ...extra }, { status })
}

export function mapKycErrorToCode(message: string): YcFundBalanceQuoteErrorCode {
  if (message === "ng_local_verification_incomplete") {
    return "ng_local_verification_incomplete"
  }
  return "kyc_metadata_incomplete"
}
