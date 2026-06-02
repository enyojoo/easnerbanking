import { describe, expect, it } from "vitest"
import {
  pickBestWalletInferenceCandidate,
  resolveInferredWalletAssetNetwork,
  type WalletAddressInferenceCandidate,
} from "./wallet-address-inference"

const solanaCandidates: WalletAddressInferenceCandidate[] = [
  { asset: "USDC", network: "Solana", confidence: "medium", reason: "Solana base58" },
  { asset: "USDT", network: "Solana", confidence: "low", reason: "Solana base58" },
  { asset: "EURC", network: "Solana", confidence: "low", reason: "Solana base58" },
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
  it("keeps EURC when user selected EURC and Solana address is ambiguous", () => {
    const best = pickBestWalletInferenceCandidate(solanaCandidates)!
    const resolved = resolveInferredWalletAssetNetwork({
      candidates: solanaCandidates,
      best,
      previousAsset: "EURC",
      networksByAsset: { EURC: ["Solana"], USDC: ["Solana"] },
    })
    expect(resolved).toEqual({ asset: "EURC", network: "Solana" })
  })

  it("uses high-confidence asset for Tron", () => {
    const candidates: WalletAddressInferenceCandidate[] = [
      { asset: "USDT", network: "Tron", confidence: "high", reason: "tron" },
    ]
    const best = pickBestWalletInferenceCandidate(candidates)!
    const resolved = resolveInferredWalletAssetNetwork({
      candidates,
      best,
      previousAsset: "EURC",
    })
    expect(resolved).toEqual({ asset: "USDT", network: "Tron" })
  })
})
