import { applyCryptoCustomerRate, parseWalletSendMarginFromEnv, walletSendMarginBps } from "@easner/rate-sync"
import { createClient } from "@supabase/supabase-js"
import { relayQuote } from "@/lib/relay/quote"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/relay/token-map"
import { isRelayConfigured, relayRateProbeTronAddress, requireCryptoRatesProbeSolAddress } from "@/lib/relay/config"
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
  return requireCryptoRatesProbeSolAddress()
}

function dummyToAddress(asset: string, network: string): string {
  if (network === "Tron") return relayRateProbeTronAddress()
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

          if (!isRelayConfigured()) {
            skippedPairs.push({
              from_currency: fromCurrency,
              to_currency: asset,
              receive_network: network,
              reason: "relay_not_configured",
            })
            continue
          }
          requireRelayApiKey()

          let fromAmt: number
          let toAmt: number
          const quote = await relayQuote({
            user: probeFrom,
            recipient: dummyToAddress(asset, network),
            source,
            dest,
            amountRaw: REFERENCE_FROM_AMOUNT_USDC,
            tradeType: "EXACT_INPUT",
          })
          const fromRaw = Number(quote.details?.currencyIn?.amount ?? 0)
          const toRaw = Number(quote.details?.currencyOut?.amount ?? 0)
          fromAmt = fromRaw / 10 ** source.decimals
          toAmt = toRaw / 10 ** dest.decimals

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
            source: "relay_probe_sync",
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

  // USD↔EUR convert planning rows (USDC ↔ EURC on Solana via Relay).
  for (const [fromCurrency, toCurrency] of [
    ["USD", "EUR"],
    ["EUR", "USD"],
  ] as const) {
    try {
      const source = sourceSolVaultToken(fromCurrency)
      const dest = sourceSolVaultToken(toCurrency)
      const useRelay = isRelayConfigured()
      let fromAmt: number
      let toAmt: number

      if (useRelay) {
        const quote = await relayQuote({
          user: probeFrom,
          recipient: probeFrom,
          source,
          dest,
          amountRaw: REFERENCE_FROM_AMOUNT_USDC,
          tradeType: "EXACT_INPUT",
        })
        fromAmt = Number(quote.details?.currencyIn?.amount ?? 0) / 10 ** source.decimals
        toAmt = Number(quote.details?.currencyOut?.amount ?? 0) / 10 ** dest.decimals
      } else {
        skippedPairs.push({
          from_currency: fromCurrency,
          to_currency: toCurrency === "EUR" ? "EURC" : "USDC",
          receive_network: "Solana",
          reason: "relay_not_configured",
        })
        continue
      }

      if (!Number.isFinite(fromAmt) || !Number.isFinite(toAmt) || fromAmt <= 0 || toAmt <= 0) {
        skippedPairs.push({
          from_currency: fromCurrency,
          to_currency: toCurrency === "EUR" ? "EURC" : "USDC",
          receive_network: "Solana",
          reason: "invalid convert quote amounts",
        })
        continue
      }

      const lifiMid = toAmt / fromAmt
      const destAsset = toCurrency === "EUR" ? "EURC" : "USDC"
      const marginBps = resolveCryptoMarginBps(fromCurrency, destAsset, "Solana")
      upserts.push({
        from_currency: fromCurrency,
        to_currency: destAsset,
        receive_network: "Solana",
        lifi_mid: lifiMid,
        rate: applyCryptoCustomerRate(lifiMid, marginBps / 10_000),
        margin_bps: marginBps,
        source: "relay_probe_sync",
        as_of: new Date().toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      })
    } catch (e) {
      skippedPairs.push({
        from_currency: fromCurrency,
        to_currency: toCurrency === "EUR" ? "EURC" : "USDC",
        receive_network: "Solana",
        reason: e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120),
      })
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
