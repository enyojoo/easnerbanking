import { fetchWithSession } from "@/lib/fetch-with-session"
import type { MoveQuoteState } from "@/lib/move-quote-state"
import type { BalanceMoveReviewSnapshot } from "@easner/shared"

export type ConvertQuoteResponse = {
  ok: true
  quote: {
    sessionId: string
    sourceAmount: number
    destinationAmount: number
    expiresAt: string
    rate: number
    processingFee: number
    totalDebited: number
  }
}

export async function fetchBalanceConvertQuote(input: {
  direction: "usd_to_eur" | "eur_to_usd"
  sourceAmount: number
  accountScopeHeaders?: Record<string, string>
}): Promise<MoveQuoteState> {
  const res = await fetchWithSession("/api/wallets/convert/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.accountScopeHeaders ?? {}),
    },
    body: JSON.stringify({
      direction: input.direction,
      sourceAmount: input.sourceAmount,
    }),
  })
  const json = (await res.json().catch(() => null)) as
    | ConvertQuoteResponse
    | { error?: string }
    | null
  if (!res.ok) {
    throw new Error(String(json && "error" in json ? json.error : "quote_failed"))
  }
  if (!json || !("quote" in json) || !json.quote?.sessionId) {
    throw new Error("quote_failed")
  }
  return {
    sessionId: json.quote.sessionId,
    direction: input.direction,
    sourceAmount: json.quote.sourceAmount,
    destinationAmount: json.quote.destinationAmount,
    rate: json.quote.rate,
    processingFee: json.quote.processingFee,
    totalDebited: json.quote.totalDebited,
    expiresAt: json.quote.expiresAt,
    quotedAt: Date.now(),
  }
}

export async function executeBalanceConvertRequest(input: {
  sessionId: string
  accountScopeHeaders?: Record<string, string>
}): Promise<{
  ok: true
  status: "pending" | "settled" | "failed"
  relayRequestId?: string
  transactionId?: string
}> {
  const res = await fetchWithSession("/api/wallets/convert/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.accountScopeHeaders ?? {}),
    },
    body: JSON.stringify({ sessionId: input.sessionId }),
  })
  const json = (await res.json().catch(() => null)) as
    | {
        ok?: boolean
        status?: "pending" | "settled" | "failed"
        relayRequestId?: string
        transactionId?: string
        error?: string
      }
    | null
  if (!res.ok || !json?.ok) {
    throw new Error(String(json?.error ?? "execute_failed"))
  }
  return {
    ok: true,
    status: json.status ?? "pending",
    relayRequestId: json.relayRequestId,
    transactionId: json.transactionId,
  }
}

export function moveReviewFromQuote(quote: MoveQuoteState): BalanceMoveReviewSnapshot {
  const sourceCurrency = quote.direction === "usd_to_eur" ? "USD" : "EUR"
  const destCurrency = quote.direction === "usd_to_eur" ? "EUR" : "USD"
  return {
    source_amount: quote.sourceAmount,
    source_currency: sourceCurrency,
    destination_amount: quote.destinationAmount,
    destination_currency: destCurrency,
    exchange_rate: quote.rate,
    processing_fee: quote.processingFee,
    total_debited: quote.totalDebited,
    debited_from_label: `${sourceCurrency} Balance`,
    credited_to_label: `${destCurrency} Balance`,
  }
}
