import { noahFetch } from "./http"

type TxResp = { Items?: Array<Record<string, unknown>>; PageToken?: string }

const MAX_PAGES = 30

/**
 * Pull Noah transactions for a customer within [from, to] (inclusive by date comparison on `Created`).
 */
export async function collectNoahTransactionsForRange(opts: {
  noahCustomerId: string
  from: Date
  to: Date
}): Promise<Array<Record<string, unknown>>> {
  const { noahCustomerId, from, to } = opts
  const fromMs = from.getTime()
  const toMs = to.getTime()

  const out: Array<Record<string, unknown>> = []
  let token: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await noahFetch<TxResp>({
      method: "GET",
      path: "/transactions",
      query: {
        PageSize: 50,
        SortDirection: "DESC",
        ...(token ? { PageToken: token } : {}),
      },
    })

    const items = data.Items ?? []
    let oldestOnPage = Number.POSITIVE_INFINITY

    for (const tx of items) {
      if (String(tx.CustomerID ?? "") !== noahCustomerId) continue
      const createdMs = new Date(String(tx.Created ?? 0)).getTime()
      if (Number.isFinite(createdMs)) {
        oldestOnPage = Math.min(oldestOnPage, createdMs)
      }
      if (createdMs < fromMs || createdMs > toMs) continue
      out.push(tx)
    }

    token = data.PageToken
    if (!token || items.length === 0) break
    if (oldestOnPage < fromMs) break
  }

  out.sort((a, b) => {
    const ta = new Date(String(a.Created ?? 0)).getTime()
    const tb = new Date(String(b.Created ?? 0)).getTime()
    return tb - ta
  })

  return out
}

export function statementTxMatchesCurrency(
  tx: Record<string, unknown>,
  accountCurrency: "USD" | "EUR" | "GBP",
): boolean {
  const crypto = String(tx.CryptoCurrency ?? "").toUpperCase()
  const fp = tx.FiatPayment as Record<string, unknown> | undefined
  const fiat = String(fp?.FiatCurrency ?? "").toUpperCase()
  if (accountCurrency === "USD") {
    return fiat === "USD" || crypto.includes("USDC") || crypto === "USD"
  }
  if (accountCurrency === "EUR") {
    return fiat === "EUR" || crypto.includes("EURC") || crypto === "EUR"
  }
  if (accountCurrency === "GBP") {
    return fiat === "GBP" || crypto.includes("GBP")
  }
  return false
}
