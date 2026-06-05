import { describe, expect, it } from "vitest"
import { inferWalletSendExecutionModel } from "./infer-wallet-send-execution-model"

describe("inferWalletSendExecutionModel", () => {
  it("returns direct_turnkey for Solana stables", () => {
    expect(inferWalletSendExecutionModel("USDC", "Solana")).toBe("direct_turnkey")
    expect(inferWalletSendExecutionModel("EURC", "Solana")).toBe("direct_turnkey")
  })

  it("returns lifi_bridge for other corridors", () => {
    expect(inferWalletSendExecutionModel("USDT", "Tron")).toBe("lifi_bridge")
    expect(inferWalletSendExecutionModel("USDC", "Ethereum")).toBe("lifi_bridge")
  })
})
