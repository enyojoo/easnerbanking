import { yellowcardFetch } from "./http"

export type YcAccountBalance = {
  currency: string
  available: number
  currencyType?: string
}

type YcAccountResponse = {
  accounts?: Array<{
    currency?: string
    available?: number
    currencyType?: string
  }>
}

/**
 * YC account balances (GET /account).
 * Balance-settled sends draw on this; YC requires it funded before the send is created.
 */
export async function listYcAccountBalances(): Promise<YcAccountBalance[]> {
  const res = await yellowcardFetch<YcAccountResponse>({ method: "GET", path: "/account" })
  const accounts = Array.isArray(res.accounts) ? res.accounts : []
  return accounts.map((account) => ({
    currency: String(account.currency ?? "").trim().toUpperCase(),
    available: Number(account.available ?? 0),
    currencyType: account.currencyType,
  }))
}

/**
 * Short cache so repeated quote previews do not hit GET /account per keystroke. Staleness is
 * absorbed by the float buffer callers require on top of a send's cost.
 */
const BALANCE_CACHE_TTL_MS = 15_000
const balanceCache = new Map<string, { at: number; available: number }>()

/** Available balance for a currency, or 0 when YC does not report the account. */
export async function fetchYcAvailableBalance(currency = "USD"): Promise<number> {
  const target = currency.trim().toUpperCase()
  const cached = balanceCache.get(target)
  if (cached && Date.now() - cached.at < BALANCE_CACHE_TTL_MS) return cached.available

  let available = 0
  try {
    const balances = await listYcAccountBalances()
    const match = balances.find((balance) => balance.currency === target)
    const parsed = Number(match?.available ?? 0)
    available = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    // Treat an unreadable balance as unfunded so callers fall back to direct settlement.
    available = 0
  }

  balanceCache.set(target, { at: Date.now(), available })
  return available
}
