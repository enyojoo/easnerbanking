import { yellowcardFetch } from "./http"
import type { YcServiceFeeConfig } from "@easner/shared"

export type YcFeeConfigQuery = {
  country: string
  currency: string
  channelType: "bank" | "momo"
  directSettlement: boolean
  txType?: "send" | "receive"
  /** Locked payouts bypass the indicative cache so fee guarantees use current YC config. */
  fresh?: boolean
}

type YcFeeConfigResponse = {
  serviceFee?: {
    minFeeLocal?: number
    feePercentage?: number
    flatFeeLocal?: number
  }
  message?: string
}

const CACHE_TTL_MS = 10 * 60_000
const cache = new Map<string, { at: number; config: YcServiceFeeConfig | null }>()

function positive(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Corridor-specific YC fee used to gross up direct-settlement USDC. */
export async function fetchYcSendServiceFeeConfig(
  query: YcFeeConfigQuery,
): Promise<YcServiceFeeConfig | null> {
  const key = [
    query.txType ?? "send",
    query.country.toUpperCase(),
    query.currency.toUpperCase(),
    query.channelType,
    query.directSettlement ? "direct" : "balance",
  ].join(":")
  const cached = cache.get(key)
  if (!query.fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.config

  let config: YcServiceFeeConfig | null = null
  try {
    const response = await yellowcardFetch<YcFeeConfigResponse>({
      method: "POST",
      path: "/fees/get-config",
      json: {
        txType: query.txType ?? "send",
        country: query.country.toUpperCase(),
        currency: query.currency.toUpperCase(),
        channelType: query.channelType,
        directSettlement: query.directSettlement,
      },
    })
    if (response.serviceFee) {
      config = {
        minFeeLocal: positive(response.serviceFee.minFeeLocal),
        feePercentage: positive(response.serviceFee.feePercentage),
        flatFeeLocal: positive(response.serviceFee.flatFeeLocal),
      }
    } else if (String(response.message ?? "").toLowerCase().includes("no fees configured")) {
      config = { minFeeLocal: 0, feePercentage: 0, flatFeeLocal: 0 }
    }
  } catch {
    // The lock still validates YC's response and floors the result when config is unavailable.
  }

  cache.set(key, { at: Date.now(), config })
  return config
}

export function resetYcSendFeeConfigCache(): void {
  cache.clear()
}
