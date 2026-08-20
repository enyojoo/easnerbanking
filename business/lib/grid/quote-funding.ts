import { gridFetch, gridFetchAllPages } from "./http"
import { extractGridFundingSolanaAddress } from "./external-account"
import type { GridPaymentInstruction, GridQuote } from "./types"

type GridInternalAccountRow = {
  type?: string
  status?: string
  balance?: { currency?: { code?: string } }
  fundingPaymentInstructions?: GridPaymentInstruction | GridPaymentInstruction[]
}

/** GET /quotes/{id} – payment instructions may appear after create. */
export async function retrieveGridQuote(quoteId: string): Promise<GridQuote> {
  return gridFetch<GridQuote>({
    method: "GET",
    path: `/quotes/${encodeURIComponent(quoteId.trim())}`,
  })
}

const PLATFORM_USDC_FUNDING_TTL_MS = 30 * 60_000
let cachedPlatformUsdcFunding: { at: number; instructions: GridPaymentInstruction[] } | null = null

/** Standing USDC internal-account deposit instructions (JIT funding fallback). */
export async function resolveGridPlatformUsdcFundingInstructions(): Promise<
  GridPaymentInstruction[] | null
> {
  if (
    cachedPlatformUsdcFunding &&
    Date.now() - cachedPlatformUsdcFunding.at < PLATFORM_USDC_FUNDING_TTL_MS
  ) {
    return cachedPlatformUsdcFunding.instructions
  }
  const rows = await gridFetchAllPages<GridInternalAccountRow>({
    path: "/customers/internal-accounts",
    query: { currency: "USDC", type: "INTERNAL_CRYPTO" },
    mapPage: (page) => page.data ?? [],
    maxPages: 1,
  })
  const active =
    rows.find(
      (row) =>
        String(row.status ?? "").toUpperCase() === "ACTIVE" &&
        String(row.balance?.currency?.code ?? "").toUpperCase() === "USDC",
    ) ?? rows[0]
  const instructions = active?.fundingPaymentInstructions
  if (!instructions) return null
  const list = Array.isArray(instructions) ? instructions : [instructions]
  cachedPlatformUsdcFunding = { at: Date.now(), instructions: list }
  return list
}

/**
 * Ensure quote carries Solana USDC funding instructions for balance payout.
 * Create response, then GET quote. Do not fall back to platform USDC deposit
 * instructions – those are not this quote's REALTIME_FUNDING address.
 */
export async function hydrateGridQuotePaymentInstructions(
  quote: GridQuote,
  opts?: { skipRetrieve?: boolean },
): Promise<GridQuote> {
  if (extractGridFundingSolanaAddress(quote)) return quote

  const quoteId = String(quote.id ?? "").trim()
  if (!opts?.skipRetrieve && quoteId) {
    try {
      const retrieved = await retrieveGridQuote(quoteId)
      const retrievedFunding = retrieved.fundingPaymentInstructions
      const merged: GridQuote = {
        ...quote,
        paymentInstructions: retrieved.paymentInstructions ?? quote.paymentInstructions,
        ...(retrievedFunding ? { fundingPaymentInstructions: retrievedFunding } : {}),
      }
      if (extractGridFundingSolanaAddress(merged)) return merged
      return merged
    } catch (e) {
      console.warn(
        "[grid] quote retrieve for funding instructions failed:",
        e instanceof Error ? e.message : e,
      )
    }
  }

  return quote
}

export function resolveGridQuoteFundingAddress(quote: GridQuote): string | null {
  return extractGridFundingSolanaAddress(quote)
}
