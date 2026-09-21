import type { RelayRequestV3, RelayRequestV3Status } from "./types"

type FeeComponent = { usd?: string; amount?: string; amountFormatted?: string }

type FeesPhase = {
  swap?: FeeComponent
  execution?: FeeComponent
  platform?: FeeComponent
  relay?: FeeComponent
  app?: FeeComponent
  sponsored?: FeeComponent
}

function readUsd(component: FeeComponent | undefined): number {
  const n = Number(component?.usd ?? NaN)
  return Number.isFinite(n) ? n : 0
}

function sumFeeComponents(phase: FeesPhase | undefined): number {
  if (!phase) return 0
  const platform = phase.platform ?? phase.relay
  return (
    Math.abs(readUsd(phase.swap)) +
    Math.abs(readUsd(phase.execution)) +
    Math.abs(readUsd(platform)) +
    Math.abs(readUsd(phase.app))
  )
}

export function parseRelayFeesV3(request: RelayRequestV3): {
  quotedUsd: number
  actualUsd: number
  userPaysUsd: number
  sponsoredUsd: number
} {
  const data = request.data ?? {}
  const fees = data.fees as { quoted?: FeesPhase; actual?: FeesPhase } | undefined
  const quotedUsd = sumFeeComponents(fees?.quoted)
  const actualUsd = sumFeeComponents(fees?.actual)

  const sponsorship = data.feeSponsorship as
    | {
        actual?: {
          sponsoredTotal?: { amountUsd?: string }
          userPaysTotal?: { amountUsd?: string }
        }
      }
    | undefined

  const sponsoredUsd = Number(sponsorship?.actual?.sponsoredTotal?.amountUsd ?? 0)
  const userPaysUsd = Number(sponsorship?.actual?.userPaysTotal?.amountUsd ?? actualUsd)

  return {
    quotedUsd: Math.round(quotedUsd * 1_000_000) / 1_000_000,
    actualUsd: Math.round(actualUsd * 1_000_000) / 1_000_000,
    userPaysUsd: Number.isFinite(userPaysUsd) ? userPaysUsd : actualUsd,
    sponsoredUsd: Number.isFinite(sponsoredUsd) ? sponsoredUsd : 0,
  }
}

type RoutePhase = {
  rate?: string
  origin?: {
    inputCurrency?: { amount?: string; amountFormatted?: string; currency?: { decimals?: number } }
    outputCurrency?: { amount?: string; amountFormatted?: string; currency?: { decimals?: number } }
  }
  destination?: {
    inputCurrency?: { amount?: string; amountFormatted?: string; currency?: { decimals?: number } }
    outputCurrency?: { amount?: string; amountFormatted?: string; currency?: { decimals?: number } }
  }
}

function readAmountHuman(
  row:
    | { amount?: string; amountFormatted?: string; currency?: { decimals?: number } }
    | undefined,
): number | null {
  if (!row) return null
  const formatted = Number(row.amountFormatted ?? NaN)
  if (Number.isFinite(formatted)) return formatted
  const raw = String(row.amount ?? "").trim()
  if (!raw) return null
  const decimals = Number(row.currency?.decimals ?? 6)
  const n = Number(raw) / 10 ** decimals
  return Number.isFinite(n) ? n : null
}

export function parseRelayRouteAmountsV3(request: RelayRequestV3): {
  deposited: number | null
  received: number | null
  rate: number | null
} {
  const data = request.data ?? {}
  const route = data.route as { quoted?: RoutePhase; actual?: RoutePhase } | undefined
  const actual = route?.actual ?? route?.quoted

  const deposited =
    readAmountHuman(actual?.origin?.inputCurrency) ??
    readAmountHuman(route?.quoted?.origin?.inputCurrency)

  let received = readAmountHuman(actual?.destination?.outputCurrency)
  if (received == null) {
    received = readAmountHuman(actual?.origin?.outputCurrency)
  }
  if (received == null) {
    received = readAmountHuman(route?.quoted?.destination?.outputCurrency)
  }

  const rateRaw = Number(actual?.rate ?? NaN)
  const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : null

  return { deposited, received, rate }
}

const TERMINAL: RelayRequestV3Status[] = ["success", "failure", "refund"]

export function isRelayRequestTerminalV3(status: string): boolean {
  return TERMINAL.includes(status as RelayRequestV3Status)
}

export function mapRelayRequestStatusV3(
  status: string,
): "pending" | "settled" | "failed" {
  if (status === "success") return "settled"
  if (status === "failure" || status === "refund") return "failed"
  return "pending"
}

export function extractRelayOutTxHashesV3(request: RelayRequestV3): string[] {
  const data = request.data ?? {}
  const outTxs = (data.outTxs as Array<{ txHash?: string; hash?: string }> | undefined) ?? []
  const hashes: string[] = []
  for (const row of outTxs) {
    const h = String(row.txHash ?? row.hash ?? "").trim()
    if (h) hashes.push(h)
  }
  const protocol = request.protocol as
    | { settlement?: { destination?: { fills?: Array<{ transactionId?: string }> } } }
    | undefined
  for (const fill of protocol?.settlement?.destination?.fills ?? []) {
    const h = String(fill.transactionId ?? "").trim()
    if (h) hashes.push(h)
  }
  return [...new Set(hashes)]
}

export function extractRelayInTxHashesV3(request: RelayRequestV3): string[] {
  const data = request.data ?? {}
  const inTxs = (data.inTxs as Array<{ txHash?: string; hash?: string }> | undefined) ?? []
  const hashes: string[] = []
  for (const row of inTxs) {
    const h = String(row.txHash ?? row.hash ?? "").trim()
    if (h) hashes.push(h)
  }
  const depositTx = String(request.depositAddress?.depositTxHash ?? "").trim()
  if (depositTx) hashes.push(depositTx)
  return [...new Set(hashes)]
}

export function readRelayDepositAddressV3(request: RelayRequestV3): string | null {
  const obj = request.depositAddress
  if (obj && typeof obj === "object") {
    const addr = String(obj.address ?? "").trim()
    if (addr) return addr
  }
  return null
}

function relayEpochToIso(ts: number): string | null {
  if (!Number.isFinite(ts) || ts <= 0) return null
  const ms = ts > 1e12 ? ts : ts * 1000
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Tron deposit time, then Solana fill time, then Relay createdAt. */
export function extractRelayOccurredAtV3(request: RelayRequestV3): string | null {
  const data = request.data ?? {}
  const inTxs = (data.inTxs as Array<{ timestamp?: number }> | undefined) ?? []
  const outTxs = (data.outTxs as Array<{ timestamp?: number }> | undefined) ?? []
  for (const row of [...inTxs, ...outTxs]) {
    const iso = relayEpochToIso(Number(row?.timestamp ?? NaN))
    if (iso) return iso
  }
  const created = String(request.createdAt ?? "").trim()
  if (created && !Number.isNaN(Date.parse(created))) return new Date(created).toISOString()
  return null
}
