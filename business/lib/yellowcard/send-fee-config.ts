import { yellowcardFetch } from "./http"
import type { YcServiceFeeConfig } from "@easner/shared"

export type YcFeeConfigQuery = {
  country: string
  currency: string
  channelType: "bank" | "momo"
  /** Crypto-settled send (true) and balance-settled send (false) have different schedules. */
  directSettlement: boolean
  txType?: "send" | "receive"
}

type YcFeeConfigResponse = {
  serviceFee?: {
    minFeeLocal?: number
    feePercentage?: number
    flatFeeLocal?: number
  }
  message?: string
}

const FEE_CONFIG_CACHE_TTL_MS = 10 * 60_000
const feeConfigCache = new Map<string, { at: number; config: YcServiceFeeConfig | null }>()

function cacheKey(query: YcFeeConfigQuery): string {
  return [
    query.txType ?? "send",
    query.country.trim().toUpperCase(),
    query.currency.trim().toUpperCase(),
    query.channelType,
    query.directSettlement ? "direct" : "balance",
  ].join(":")
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Authoritative YC service fee for a corridor. Send-leg crypto sizing must use this —
 * assuming 1% undersizes KES momo (2%) into repeated shortfall retries and oversizes
 * ZAR bank (0.5%) into paying the recipient more than quoted.
 *
 * Returns null when YC answers "no fees configured for input" so callers keep their default.
 */
export async function fetchYcSendServiceFeeConfig(
  query: YcFeeConfigQuery,
): Promise<YcServiceFeeConfig | null> {
  const key = cacheKey(query)
  const cached = feeConfigCache.get(key)
  if (cached && Date.now() - cached.at < FEE_CONFIG_CACHE_TTL_MS) return cached.config

  let config: YcServiceFeeConfig | null = null
  try {
    const res = await yellowcardFetch<YcFeeConfigResponse>({
      method: "POST",
      path: "/fees/get-config",
      json: {
        txType: query.txType ?? "send",
        country: query.country.trim().toUpperCase(),
        currency: query.currency.trim().toUpperCase(),
        channelType: query.channelType,
        directSettlement: query.directSettlement,
      },
    })
    const serviceFee = res.serviceFee
    if (serviceFee) {
      config = {
        minFeeLocal: toNumber(serviceFee.minFeeLocal),
        feePercentage: toNumber(serviceFee.feePercentage),
        flatFeeLocal: toNumber(serviceFee.flatFeeLocal),
      }
    }
  } catch {
    // Sizing falls back to the default fee fraction rather than blocking the lock.
    config = null
  }

  feeConfigCache.set(key, { at: Date.now(), config })
  return config
}

/** Test hook — the module-level cache would otherwise leak between cases. */
export function resetYcSendFeeConfigCache(): void {
  feeConfigCache.clear()
}
