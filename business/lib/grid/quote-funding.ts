import { gridFetch, gridFetchAllPages } from "./http"
import { extractGridFundingSolanaAddress } from "./external-account"
import type { GridPaymentInstruction, GridQuote } from "./types"

type GridInternalAccountRow = {
  type?: string
  status?: string
  balance?: { currency?: { code?: string } }
  fundingPaymentInstructions?: GridPaymentInstruction | GridPaymentInstruction[]
}

/** GET /quotes/{id} — payment instructions may appear after create. */
export async function retrieveGridQuote(quoteId: string): Promise<GridQuote> {
  return gridFetch<GridQuote>({
    method: "GET",
    path: `/quotes/${encodeURIComponent(quoteId.trim())}`,
  })
}

/** Standing USDC internal-account deposit instructions (JIT funding fallback). */
export async function resolveGridPlatformUsdcFundingInstructions(): Promise<
  GridPaymentInstruction[] | null
> {
  const rows = await gridFetchAllPages<GridInternalAccountRow>({
    path: "/customers/internal-accounts",
    query: { currency: "USDC", type: "INTERNAL_CRYPTO" },
    mapPage: (page) => page.data ?? [],
  })
  const active =
    rows.find(
      (row) =>
        String(row.status ?? "").toUpperCase() === "ACTIVE" &&
        String(row.balance?.currency?.code ?? "").toUpperCase() === "USDC",
    ) ?? rows[0]
  const instructions = active?.fundingPaymentInstructions
  if (!instructions) return null
  return Array.isArray(instructions) ? instructions : [instructions]
}

/**
 * Ensure quote carries Solana USDC funding instructions for balance payout.
 * Tries create response → GET quote → customer USDC internal account.
 */
export async function hydrateGridQuotePaymentInstructions(quote: GridQuote): Promise<GridQuote> {
  if (extractGridFundingSolanaAddress(quote)) return quote

  const quoteId = String(quote.id ?? "").trim()
  if (quoteId) {
    try {
      const retrieved = await retrieveGridQuote(quoteId)
      const retrievedFunding = retrieved.fundingPaymentInstructions
      const merged: GridQuote = {
        ...quote,
        paymentInstructions: retrieved.paymentInstructions ?? quote.paymentInstructions,
        ...(retrievedFunding ? { fundingPaymentInstructions: retrievedFunding } : {}),
      }
      if (extractGridFundingSolanaAddress(merged)) return merged
      quote = merged
    } catch (e) {
      console.warn(
        "[grid] quote retrieve for funding instructions failed:",
        e instanceof Error ? e.message : e,
      )
    }
  }

  try {
    const platform = await resolveGridPlatformUsdcFundingInstructions()
    if (platform && extractGridFundingSolanaAddress({ paymentInstructions: platform })) {
      return { ...quote, paymentInstructions: platform }
    }
  } catch (e) {
    console.warn(
      "[grid] platform USDC funding instructions lookup failed:",
      e instanceof Error ? e.message : e,
    )
  }

  return quote
}

export function resolveGridQuoteFundingAddress(quote: GridQuote): string | null {
  return extractGridFundingSolanaAddress(quote)
}
