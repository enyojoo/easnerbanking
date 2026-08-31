import { NextResponse } from "next/server"
import {
  FundBalanceQuoteServiceError,
  confirmFundBalanceOrder,
} from "@/lib/yellowcard/fund-balance-quote-service"
import { ycFundBalanceQuoteError } from "@/lib/yellowcard/fund-balance-quote-errors"
import { resolveYcFundBalanceContext } from "@/lib/yellowcard/resolve-fund-balance-context"

export const runtime = "nodejs"

/** Lock YC receive + create ledger rows after user confirms review. */
export async function POST(request: Request) {
  const resolved = await resolveYcFundBalanceContext(request)
  if ("error" in resolved) return resolved.error

  try {
    const quote = await confirmFundBalanceOrder(resolved.ctx)
    return NextResponse.json(quote)
  } catch (e) {
    if (e instanceof FundBalanceQuoteServiceError) {
      return ycFundBalanceQuoteError(e.code, e.message, e.status, e.extra)
    }
    const message = e instanceof Error ? e.message : "Fund balance confirm failed"
    return ycFundBalanceQuoteError("yc_confirm_failed", message, 400)
  }
}
