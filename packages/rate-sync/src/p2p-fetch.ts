/** Fetch supplier BUY/SELL (fiat per USDC) from p2p.army or fallbacks. */

const P2P_BASE = "https://p2p.army/en/p2p/fiats"

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
}

export async function fetchText(
  url: string,
  timeoutMs = 55_000,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { ...BROWSER_HEADERS, ...extraHeaders },
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

/** Mean price from p2p.army block; pages label asset USDT or USDC. */
export function parseP2pArmyBuySell(html: string): { buy: number | null; sell: number | null } {
  const buyH = /<h4[^>]*>\s*BUY\s+Section/i.exec(html)
  const sellH = /<h4[^>]*>\s*SELL\s+section/i.exec(html)
  if (!buyH || !sellH) return { buy: null, sell: null }
  const buyBlock = html.slice(buyH.index + buyH[0].length, sellH.index)
  const sellBlock = html.slice(sellH.index + sellH[0].length, sellH.index + sellH[0].length + 90_000)

  const meanStablecoin = (block: string): number | null => {
    const re = /asset=(?:USDT|USDC)" class="mono _price">([^<]+)<\/a>/gi
    const prices: number[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(block)) !== null) {
      const s = m[1].replace(/\xa0/g, "").replace(/\s/g, "").replace(",", ".")
      const v = parseFloat(s)
      if (!Number.isNaN(v)) prices.push(v)
    }
    if (!prices.length) return null
    return prices.reduce((a, b) => a + b, 0) / prices.length
  }

  return { buy: meanStablecoin(buyBlock), sell: meanStablecoin(sellBlock) }
}

export async function fetchErRate(usdPerUnit: string): Promise<number> {
  const openEr = async () => {
    const j = await fetchText("https://open.er-api.com/v6/latest/USD", 25_000, {
      Accept: "application/json",
    })
    const data = JSON.parse(j) as { rates?: Record<string, number> }
    const r = data.rates?.[usdPerUnit]
    if (typeof r !== "number") throw new Error(`open.er-api missing ${usdPerUnit}`)
    return r
  }

  const fawazJsDelivr = async () => {
    const j = await fetchText(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      28_000,
      { Accept: "application/json" },
    )
    const data = JSON.parse(j) as { usd?: Record<string, number> }
    const r = data.usd?.[usdPerUnit.toLowerCase()]
    if (typeof r !== "number") throw new Error(`currency-api missing ${usdPerUnit}`)
    return r
  }

  const frankfurter = async () => {
    const to = encodeURIComponent(usdPerUnit)
    const j = await fetchText(
      `https://api.frankfurter.app/latest?from=USD&to=${to}`,
      25_000,
      { Accept: "application/json" },
    )
    const data = JSON.parse(j) as { rates?: Record<string, number> }
    const r = data.rates?.[usdPerUnit]
    if (typeof r !== "number") throw new Error(`frankfurter missing ${usdPerUnit}`)
    return r
  }

  let last: Error | undefined
  for (const fn of [openEr, fawazJsDelivr, frankfurter]) {
    try {
      return await fn()
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw last ?? new Error(`FX rate fallback exhausted for ${usdPerUnit}`)
}

async function resolveUsdcUsdSpot(): Promise<{ last: number; source: string }> {
  const browserJsonHeaders = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": BROWSER_HEADERS["User-Agent"],
  }
  const withTimeout = async (url: string, ms: number): Promise<Response> => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)
    try {
      return await fetch(url, { signal: ctrl.signal, headers: browserJsonHeaders })
    } finally {
      clearTimeout(t)
    }
  }

  try {
    const res = await withTimeout(
      "https://api.bybit.com/v5/market/tickers?category=spot&symbol=USDCUSD",
      20_000,
    )
    if (res.ok) {
      const data = (await res.json()) as { result?: { list?: { lastPrice?: string }[] } }
      const last = data.result?.list?.[0]?.lastPrice
      if (last != null) {
        const v = parseFloat(last)
        if (v > 0 && v < 2) return { last: v, source: "Bybit USDCUSD" }
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const res = await withTimeout(
      "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd",
      15_000,
    )
    if (res.ok) {
      const data = (await res.json()) as { "usd-coin"?: { usd?: number } }
      const u = data["usd-coin"]?.usd
      if (typeof u === "number" && u > 0 && u < 2) return { last: u, source: "CoinGecko usdc/usd" }
    }
  } catch {
    /* fall through */
  }

  return { last: 1, source: "peg 1 (fallback)" }
}

export async function fetchUsdcUsdLast(): Promise<number> {
  const { last } = await resolveUsdcUsdSpot()
  return last
}

export async function fetchBuySellForCurrency(
  ccy: string,
): Promise<{ buy: number; sell: number; source: string }> {
  if (ccy === "USD") {
    const { last, source } = await resolveUsdcUsdSpot()
    return { buy: last, sell: last, source }
  }

  try {
    const html = await fetchText(`${P2P_BASE}/${ccy}`, 55_000)
    const { buy, sell } = parseP2pArmyBuySell(html)
    if (buy != null && sell != null) {
      return { buy, sell, source: "p2p.army" }
    }
  } catch {
    /* fall through */
  }

  const v = await fetchErRate(ccy)
  return { buy: v, sell: v, source: "er-api fallback" }
}
