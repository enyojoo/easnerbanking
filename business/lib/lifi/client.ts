const LIFI_BASE = "https://li.quest/v1"

export function getLifiApiKey(): string {
  return String(process.env.LIFI_API_KEY || "").trim()
}

export function getLifiIntegrator(): string {
  return String(process.env.LIFI_INTEGRATOR || "easner").trim() || "easner"
}

export function isWalletSendEnabled(): boolean {
  const raw = String(process.env.WALLET_SEND_ENABLED || "true").trim().toLowerCase()
  return raw !== "false" && raw !== "0" && raw !== "off"
}

export type LifiQuoteRequest = {
  fromChain: number | string
  toChain: number | string
  fromToken: string
  toToken: string
  fromAddress: string
  toAddress: string
  fromAmount?: string
  toAmount?: string
  integrator?: string
  fee?: number
  slippage?: number
}

export type LifiQuoteResponse = {
  id?: string
  estimate?: {
    fromAmount?: string
    toAmount?: string
    toAmountMin?: string
    feeCosts?: Array<{ name?: string; amount?: string; amountUSD?: string; included?: boolean }>
    gasCosts?: Array<{ name?: string; amount?: string; amountUSD?: string; included?: boolean }>
  }
  transactionRequest?: unknown
  tool?: string
  action?: unknown
}

export async function lifiQuote(params: LifiQuoteRequest): Promise<LifiQuoteResponse> {
  const apiKey = getLifiApiKey()
  const qs = new URLSearchParams({
    fromChain: String(params.fromChain),
    toChain: String(params.toChain),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
    integrator: params.integrator ?? getLifiIntegrator(),
    slippage: String(params.slippage ?? 0.03),
  })
  if (params.fromAmount) qs.set("fromAmount", params.fromAmount)
  if (params.toAmount) qs.set("toAmount", params.toAmount)
  if (!params.fromAmount && !params.toAmount) {
    throw new Error("lifi_quote_requires_from_or_to_amount")
  }
  if (params.fee != null && params.fee > 0) {
    qs.set("fee", String(params.fee))
  }

  const headers: Record<string, string> = { Accept: "application/json" }
  if (apiKey) headers["x-lifi-api-key"] = apiKey

  const res = await fetch(`${LIFI_BASE}/quote?${qs.toString()}`, { headers, cache: "no-store" })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`lifi_quote_failed:${res.status}:${body.slice(0, 200)}`)
  }
  return (await res.json()) as LifiQuoteResponse
}

export async function lifiGetStatus(txHash: string, bridge?: string): Promise<{ status?: string }> {
  const apiKey = getLifiApiKey()
  const qs = new URLSearchParams({ txHash })
  if (bridge) qs.set("bridge", bridge)
  const headers: Record<string, string> = { Accept: "application/json" }
  if (apiKey) headers["x-lifi-api-key"] = apiKey
  const res = await fetch(`${LIFI_BASE}/status?${qs.toString()}`, { headers, cache: "no-store" })
  if (!res.ok) throw new Error(`lifi_status_failed:${res.status}`)
  return (await res.json()) as { status?: string }
}

export async function lifiFetchChains(): Promise<Array<{ id: number | string; key?: string; logoURI?: string }>> {
  const apiKey = getLifiApiKey()
  const headers: Record<string, string> = { Accept: "application/json" }
  if (apiKey) headers["x-lifi-api-key"] = apiKey
  const res = await fetch(`${LIFI_BASE}/chains`, { headers, cache: "no-store" })
  if (!res.ok) throw new Error(`lifi_chains_failed:${res.status}`)
  const data = (await res.json()) as { chains?: Array<{ id: number | string; key?: string; logoURI?: string }> }
  return data.chains ?? []
}

export async function lifiFetchTokens(chainIds: Array<number | string>): Promise<
  Array<{ chainId: number | string; address: string; symbol?: string; logoURI?: string }>
> {
  const apiKey = getLifiApiKey()
  const headers: Record<string, string> = { Accept: "application/json" }
  if (apiKey) headers["x-lifi-api-key"] = apiKey
  const qs = new URLSearchParams({ chains: chainIds.map(String).join(",") })
  const res = await fetch(`${LIFI_BASE}/tokens?${qs.toString()}`, { headers, cache: "no-store" })
  if (!res.ok) throw new Error(`lifi_tokens_failed:${res.status}`)
  const data = (await res.json()) as {
    tokens?: Record<string, Array<{ chainId: number | string; address: string; symbol?: string; logoURI?: string }>>
  }
  const out: Array<{ chainId: number | string; address: string; symbol?: string; logoURI?: string }> = []
  for (const list of Object.values(data.tokens ?? {})) {
    out.push(...list)
  }
  return out
}
