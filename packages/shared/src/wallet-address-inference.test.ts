import { describe, expect, it } from "vitest"
import {
  pickBestWalletInferenceCandidate,
  resolveInferredWalletAssetNetwork,
  type WalletAddressInferenceCandidate,
} from "./wallet-address-inference"

const solanaCandidates: WalletAddressInferenceCandidate[] = [
  { asset: "USDC", network: "Solana", confidence: "medium", reason: "Solana base58" },
  { asset: "USDT", network: "Solana", confidence: "medium", reason: "Solana base58" },
  { asset: "EURC", network: "Solana", confidence: "medium", reason: "Solana base58" },
]

const evmCandidates: WalletAddressInferenceCandidate[] = [
  { asset: "USDC", network: "Ethereum", confidence: "medium", reason: "EVM" },
  { asset: "USDT", network: "Ethereum", confidence: "medium", reason: "EVM" },
  { asset: "USDC", network: "Base", confidence: "medium", reason: "EVM" },
]

describe("pickBestWalletInferenceCandidate", () => {
  it("prefers high confidence over medium", () => {
    const best = pickBestWalletInferenceCandidate([
      { asset: "USDC", network: "Ethereum", confidence: "medium", reason: "evm" },
      { asset: "USDT", network: "Tron", confidence: "high", reason: "tron" },
    ])
    expect(best?.asset).toBe("USDT")
  })
})

describe("resolveInferredWalletAssetNetwork", () => {
  it("maps Tron to USDT regardless of prior asset", () => {
    const candidates: WalletAddressInferenceCandidate[] = [
      { asset: "USDT", network: "Tron", confidence: "high", reason: "tron" },
    ]
    const resolved = resolveInferredWalletAssetNetwork({
      candidates,
      previousAsset: "EURC",
    })
    expect(resolved).toEqual({ asset: "USDT", network: "Tron" })
  })

  it("defaults Solana to USDC when no prior asset", () => {
    const resolved = resolveInferredWalletAssetNetwork({
      candidates: solanaCandidates,
    })
    expect(resolved).toEqual({ asset: "USDC", network: "Solana" })
  })

  it("keeps USDT on Solana when user selected USDT", () => {
    const resolved = resolveInferredWalletAssetNetwork({
      candidates: solanaCandidates,
      previousAsset: "USDT",
    })
    expect(resolved).toEqual({ asset: "USDT", network: "Solana" })
  })

  it("keeps EURC on Solana when user selected EURC", () => {
    const resolved = resolveInferredWalletAssetNetwork({
      candidates: solanaCandidates,
      previousAsset: "EURC",
      networksByAsset: { EURC: ["Solana"], USDC: ["Solana"], USDT: ["Solana"] },
    })
    expect(resolved).toEqual({ asset: "EURC", network: "Solana" })
  })

  it("maps EVM to USDT Ethereum when user selected USDT", () => {
    const resolved = resolveInferredWalletAssetNetwork({
      candidates: evmCandidates,
      previousAsset: "USDT",
    })
    expect(resolved).toEqual({ asset: "USDT", network: "Ethereum" })
  })

  it("defaults EVM to USDC Ethereum when no prior selection", () => {
    const resolved = resolveInferredWalletAssetNetwork({
      candidates: evmCandidates,
    })
    expect(resolved).toEqual({ asset: "USDC", network: "Ethereum" })
  })

  it("keeps USDC on Base when user had Base selected", () => {
    const resolved = resolveInferredWalletAssetNetwork({
      candidates: evmCandidates,
      previousAsset: "USDC",
      previousNetwork: "Base",
    })
    expect(resolved).toEqual({ asset: "USDC", network: "Base" })
  })

  it("uses eip155 Base candidate when only Base is returned", () => {
    const resolved = resolveInferredWalletAssetNetwork({
      candidates: [
        { asset: "USDC", network: "Base", confidence: "high", reason: "eip155 Base" },
      ],
    })
    expect(resolved).toEqual({ asset: "USDC", network: "Base" })
  })
})
