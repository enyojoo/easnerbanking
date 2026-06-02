import { listWalletSendCorridors } from "./corridors"
import { WALLET_ASSET_NETWORKS } from "@/lib/wallet-asset-networks"

export type AddressInferenceCandidate = {
  asset: string
  network: string
  confidence: "high" | "medium" | "low"
  reason: string
}

function stripUri(raw: string): string {
  const trimmed = String(raw || "").trim()
  if (!trimmed) return ""
  const noQuery = trimmed.split("?")[0]
  if (noQuery.includes(":")) {
    const parts = noQuery.split(":")
    return parts[parts.length - 1] || trimmed
  }
  return noQuery
}

function isEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr)
}

function isTronAddress(addr: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)
}

function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr) && !addr.startsWith("T")
}

export function inferWalletAddress(rawInput: string): AddressInferenceCandidate[] {
  const raw = String(rawInput || "").trim()
  if (!raw) return []

  const lower = raw.toLowerCase()
  const enabled = new Set(
    listWalletSendCorridors()
      .filter((c) => c.enabled)
      .map((c) => `${c.asset}:${c.network}`),
  )

  const pushIfEnabled = (
    out: AddressInferenceCandidate[],
    asset: string,
    network: string,
    confidence: AddressInferenceCandidate["confidence"],
    reason: string,
  ) => {
    const key = `${asset}:${network}`
    if (!enabled.has(key)) return
    if (!WALLET_ASSET_NETWORKS[asset]?.includes(network)) return
    out.push({ asset, network, confidence, reason })
  }

  const out: AddressInferenceCandidate[] = []

  if (lower.startsWith("tron:")) {
    pushIfEnabled(out, "USDT", "Tron", "high", "tron URI scheme")
    return out
  }
  if (lower.startsWith("solana:") || lower.startsWith("sol:")) {
    pushIfEnabled(out, "USDC", "Solana", "high", "solana URI scheme")
    pushIfEnabled(out, "USDT", "Solana", "medium", "solana URI scheme")
    pushIfEnabled(out, "EURC", "Solana", "medium", "solana URI scheme")
    return out
  }
  if (lower.startsWith("ethereum:") || lower.startsWith("eip155:")) {
    pushIfEnabled(out, "USDC", "Ethereum", "high", "ethereum URI scheme")
    pushIfEnabled(out, "USDT", "Ethereum", "medium", "ethereum URI scheme")
    return out
  }

  const addr = stripUri(raw)

  if (isTronAddress(addr)) {
    pushIfEnabled(out, "USDT", "Tron", "high", "Tron base58 address")
    return out
  }

  if (isEvmAddress(addr)) {
    pushIfEnabled(out, "USDC", "Ethereum", "medium", "EVM hex address")
    pushIfEnabled(out, "USDT", "Ethereum", "medium", "EVM hex address")
    pushIfEnabled(out, "USDC", "Base", "low", "EVM hex address")
    pushIfEnabled(out, "USDC", "PolygonPos", "low", "EVM hex address")
    pushIfEnabled(out, "USDC", "BSC", "low", "EVM hex address")
    return out
  }

  if (isSolanaAddress(addr)) {
    pushIfEnabled(out, "USDC", "Solana", "medium", "Solana base58 address")
    pushIfEnabled(out, "USDT", "Solana", "low", "Solana base58 address")
    pushIfEnabled(out, "EURC", "Solana", "low", "Solana base58 address")
    return out
  }

  return out
}
