import { describe, expect, it } from "vitest"
import { inferWalletSendExecutionModel } from "./infer-wallet-send-execution-model"

describe("inferWalletSendExecutionModel", () => {
  it("returns direct_turnkey for USDC/EURC on Solana", () => {
    expect(inferWalletSendExecutionModel("USDC", "Solana")).toBe("direct_turnkey")
    expect(inferWalletSendExecutionModel("EURC", "Solana")).toBe("direct_turnkey")
  })

  it("returns relay_bridge for other corridors", () => {
    expect(inferWalletSendExecutionModel("USDT", "Tron")).toBe("relay_bridge")
    expect(inferWalletSendExecutionModel("USDC", "Ethereum")).toBe("relay_bridge")
  })
})
