import { applyCryptoCustomerRate, parseWalletSendMarginFromEnv, walletSendMarginBps } from "@easner/rate-sync"
import { createClient } from "@supabase/supabase-js"
import { lifiQuote } from "@/lib/lifi/client"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/lifi/token-map"
import { WALLET_ASSET_NETWORKS } from "@/lib/wallet-asset-networks"
import { isDirectTurnkeyCorridor } from "@/lib/wallet-send/routing"

export type CryptoRateSyncResult = {
  updated: number
  skipped: number
  skippedPairs: Array<{ from_currency: string; to_currency: string; receive_network: string; reason: string }>
}

const PROBE_RECEIVE_AMOUNT = 100
const REFERENCE_FROM_AMOUNT_USDC = "100000000"

function getSupabaseServiceConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")
  return { supabaseUrl, serviceRoleKey }
}

function probeSolAddress(): string {
  const addr = String(process.env.CRYPTO_RATES_PROBE_SOL_ADDRESS || "").trim()
  if (!addr) throw new Error("CRYPTO_RATES_PROBE_SOL_ADDRESS not configured")
  return addr
}

function dummyToAddress(asset: string, network: string): string {
  if (network === "Tron") return "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
  if (network === "Solana") return "11111111111111111111111111111112"
  return "0x0000000000000000000000000000000000000001"
}

export async function syncCryptoExchangeRates(options?: { dryRun?: boolean }): Promise<CryptoRateSyncResult> {
  const defaultMargin = parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN)
  const defaultMarginBps = walletSendMarginBps(defaultMargin)
  const probeFrom = probeSolAddress()
  const skippedPairs: CryptoRateSyncResult["skippedPairs"] = []
  const upserts: Array<Record<string, unknown>> = []

  const { supabaseUrl, serviceRoleKey } = getSupabaseServiceConfig()
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existingRows } = await supabase
    .from("crypto_rates")
    .select("from_currency,to_currency,receive_network,margin_bps")
  const existingByKey = new Map<string, number>()
  for (const row of existingRows ?? []) {
    const from = String(row.from_currency ?? "").trim().toUpperCase()
    const to = String(row.to_currency ?? "").trim().toUpperCase()
    const network = String(row.receive_network ?? "").trim()
    const bps = Number(row.margin_bps)
    if (from && to && network && Number.isFinite(bps) && bps >= 0) {
      existingByKey.set(`${from}_${to}_${network}`, Math.round(bps))
    }
  }

  function resolveCryptoMarginBps(from: string, to: string, network: string): number {
    return existingByKey.get(`${from}_${to}_${network}`) ?? defaultMarginBps
  }

  function resolveCryptoMargin(from: string, to: string, network: string): number {
    return resolveCryptoMarginBps(from, to, network) / 10_000
  }

  for (const [asset, networks] of Object.entries(WALLET_ASSET_NETWORKS)) {
    for (const network of networks) {
      for (const fromCurrency of ["USD", "EUR"] as const) {
        if (fromCurrency === "EUR" && asset !== "EURC") continue
        if (fromCurrency === "USD" && asset === "EURC") continue

        if (isDirectTurnkeyCorridor(asset, network)) {
          const marginBps = resolveCryptoMarginBps(fromCurrency, asset, network)
          const effectiveMargin = marginBps / 10_000
          upserts.push({
            from_currency: fromCurrency,
            to_currency: asset,
            receive_network: network,
            lifi_mid: 1,
            rate: applyCryptoCustomerRate(1, effectiveMargin),
            margin_bps: marginBps,
            source: "direct_turnkey",
            as_of: new Date().toISOString(),
            status: "active",
            updated_at: new Date().toISOString(),
          })
          continue
        }

        try {
          const source = sourceSolVaultToken(fromCurrency)
          const dest = resolveWalletSendToken(asset, network)
          if (!dest) {
            skippedPairs.push({ from_currency: fromCurrency, to_currency: asset, receive_network: network, reason: "token map" })
            continue
          }

          const quote = await lifiQuote({
            fromChain: source.chainId,
            toChain: dest.chainId,
            fromToken: source.address,
            toToken: dest.address,
            fromAddress: probeFrom,
            toAddress: dummyToAddress(asset, network),
            fromAmount: REFERENCE_FROM_AMOUNT_USDC,
            fee: 0,
          })

          const fromAmt = Number(quote.estimate?.fromAmount ?? 0) / 10 ** source.decimals
          const toAmt = Number(quote.estimate?.toAmount ?? 0) / 10 ** dest.decimals
          if (!Number.isFinite(fromAmt) || !Number.isFinite(toAmt) || fromAmt <= 0 || toAmt <= 0) {
            skippedPairs.push({ from_currency: fromCurrency, to_currency: asset, receive_network: network, reason: "invalid quote amounts" })
            continue
          }

          const lifiMid = toAmt / fromAmt
          const marginBps = resolveCryptoMarginBps(fromCurrency, asset, network)
          const effectiveMargin = marginBps / 10_000
          upserts.push({
            from_currency: fromCurrency,
            to_currency: asset,
            receive_network: network,
            lifi_mid: lifiMid,
            rate: applyCryptoCustomerRate(lifiMid, effectiveMargin),
            margin_bps: marginBps,
            source: "lifi_probe_sync",
            as_of: new Date().toISOString(),
            status: "active",
            updated_at: new Date().toISOString(),
          })
        } catch (e) {
          skippedPairs.push({
            from_currency: fromCurrency,
            to_currency: asset,
            receive_network: network,
            reason: e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120),
          })
        }
      }
    }
  }

  if (options?.dryRun) {
    return { updated: upserts.length, skipped: skippedPairs.length, skippedPairs }
  }

  let updated = 0
  for (const row of upserts) {
    const { error } = await supabase.from("crypto_rates").upsert(row, {
      onConflict: "from_currency,to_currency,receive_network",
    })
    if (error) {
      skippedPairs.push({
        from_currency: String(row.from_currency),
        to_currency: String(row.to_currency),
        receive_network: String(row.receive_network),
        reason: error.message.slice(0, 120),
      })
    } else {
      updated++
    }
  }

  return { updated, skipped: skippedPairs.length, skippedPairs }
}

export async function syncCryptoRatesSafe(
  options?: { dryRun?: boolean },
): Promise<{ ok: true; result: CryptoRateSyncResult } | { ok: false; reason: string }> {
  try {
    const result = await syncCryptoExchangeRates(options)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
