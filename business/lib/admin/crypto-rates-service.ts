import type { SupabaseClient } from "@supabase/supabase-js"
import {
  applyCryptoCustomerRate,
  parseWalletSendMarginFromEnv,
  walletSendMarginBps,
} from "@easner/rate-sync"

export type CryptoRateUpsertRow = {
  from_currency: string
  to_currency: string
  receive_network: string
  bridge_mid?: number
  rate: number
  margin_bps?: number
  status?: string
}

const WALLET_SOURCES = new Set(["USD", "EUR"])

function assertCryptoRateRow(row: CryptoRateUpsertRow) {
  const from = String(row.from_currency || "").trim().toUpperCase()
  const to = String(row.to_currency || "").trim().toUpperCase()
  const network = String(row.receive_network || "").trim()
  if (!WALLET_SOURCES.has(from)) {
    throw new Error(`crypto_rates from_currency must be USD or EUR: ${from}`)
  }
  if (!to || to.length < 2) {
    throw new Error(`Invalid crypto_rates to_currency: ${to}`)
  }
  if (!network) {
    throw new Error(`crypto_rates receive_network is required for ${from} → ${to}`)
  }
  if (from === "EUR" && to !== "EURC") {
    throw new Error(`EUR balance only supports EURC corridors: ${to}`)
  }
  if (from === "USD" && to === "EURC") {
    throw new Error(`USD balance cannot target EURC`)
  }
  return { from, to, network }
}

export async function listCryptoRatesAdmin(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("crypto_rates")
    .select("*")
    .order("from_currency")
    .order("to_currency")
    .order("receive_network")
  if (error) throw error
  return data ?? []
}

export async function upsertCryptoRatesAdmin(admin: SupabaseClient, rows: CryptoRateUpsertRow[]) {
  const now = new Date().toISOString()
  const defaultMarginBps = walletSendMarginBps(parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN))

  const payload = rows.map((row) => {
    const { from, to, network } = assertCryptoRateRow(row)
    const bridgeMid =
      row.bridge_mid != null && Number.isFinite(row.bridge_mid) && row.bridge_mid > 0
        ? Number(row.bridge_mid)
        : Number(row.rate) || 0
    const marginBps =
      row.margin_bps != null && Number.isFinite(row.margin_bps)
        ? Math.round(row.margin_bps)
        : defaultMarginBps
    const rate =
      row.rate != null && Number.isFinite(row.rate) && row.rate > 0
        ? Number(row.rate)
        : applyCryptoCustomerRate(bridgeMid, marginBps / 10_000)

    return {
      from_currency: from,
      to_currency: to,
      receive_network: network,
      bridge_mid: bridgeMid,
      rate,
      margin_bps: marginBps,
      status: row.status ?? "active",
      source: "office",
      as_of: now,
      updated_at: now,
    }
  })

  if (payload.length === 0) return

  const { error } = await admin.from("crypto_rates").upsert(payload, {
    onConflict: "from_currency,to_currency,receive_network",
  })
  if (error) throw error
}
