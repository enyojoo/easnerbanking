import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/turnkey/send-from-omnibus", () => ({
  sendStablecoinFromDepositOmnibus: vi.fn(),
}))

import { sendStablecoinFromDepositOmnibus } from "@/lib/turnkey/send-from-omnibus"
import { executeYcCryptoDeposit } from "./execute-yc-crypto-deposit"

describe("executeYcCryptoDeposit", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.mocked(sendStablecoinFromDepositOmnibus).mockReset()
  })

  it("skips omnibus send in YC sandbox by default", async () => {
    process.env.YELLOWCARD_ENVIRONMENT = "sandbox"
    delete process.env.YC_CRYPTO_DEPOSIT_DRY_RUN
    delete process.env.DEPOSIT_SPLIT_DRY_RUN

    const result = await executeYcCryptoDeposit({
      ycWalletAddress: "wallet123",
      cryptoAmountUsd: 10,
    })

    expect(result.status).toBe("skipped")
    expect(result.dryRun).toBe(true)
    expect(sendStablecoinFromDepositOmnibus).not.toHaveBeenCalled()
  })

  it("calls omnibus send when sandbox dry-run is explicitly disabled", async () => {
    process.env.YELLOWCARD_ENVIRONMENT = "sandbox"
    process.env.YC_CRYPTO_DEPOSIT_DRY_RUN = "false"
    vi.mocked(sendStablecoinFromDepositOmnibus).mockResolvedValue({
      dryRun: false,
      providerTransactionId: "tx-1",
      sendTransactionStatusId: null,
      status: "settled",
      txHash: "hash-1",
      errorMessage: null,
    })

    const result = await executeYcCryptoDeposit({
      ycWalletAddress: "wallet123",
      cryptoAmountUsd: 10,
    })

    expect(result.status).toBe("settled")
    expect(sendStablecoinFromDepositOmnibus).toHaveBeenCalledOnce()
  })
})
