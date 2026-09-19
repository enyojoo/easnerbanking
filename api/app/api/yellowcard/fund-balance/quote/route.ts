import { NextResponse } from "next/server"
import {
  FundBalanceQuoteServiceError,
  previewFundBalanceQuote,
} from "@/lib/yellowcard/fund-balance-quote-service"
import { ycFundBalanceQuoteError } from "@/lib/yellowcard/fund-balance-quote-errors"
import { resolveYcFundBalanceContext } from "@/lib/yellowcard/resolve-fund-balance-context"
import { requireAccountAllowsForUser } from "@/lib/account-restriction"

export const runtime = "nodejs"

function mapServiceError(e: unknown) {
  if (e instanceof FundBalanceQuoteServiceError) {
    return ycFundBalanceQuoteError(e.code, e.message, e.status, e.extra)
  }
  const message = e instanceof Error ? e.message : "Fund balance quote failed"
  return ycFundBalanceQuoteError("yc_quote_failed", message, 400)
}

/** Indicative pricing – no YC API calls, no ledger rows. */
export async function POST(request: Request) {
  const resolved = await resolveYcFundBalanceContext(request)
  if ("error" in resolved) return resolved.error

  const restricted = await requireAccountAllowsForUser(resolved.ctx.admin, resolved.ctx.kycUserId, "deposit")
  if (restricted instanceof NextResponse) return restricted

  try {
    const quote = await previewFundBalanceQuote(resolved.ctx)
    return NextResponse.json(quote)
  } catch (e) {
    return mapServiceError(e)
  }
}
