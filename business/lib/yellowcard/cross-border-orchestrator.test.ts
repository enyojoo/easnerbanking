import { describe, expect, it, vi } from "vitest"
import { TLC_LOCAL_TRANSFER_METHOD } from "@easner/shared"

vi.mock("@/lib/fx/yc-rates", () => ({
  listYcRates: vi.fn(),
  findYcCrossRate: vi.fn(),
  findYcPayInLeg: vi.fn(),
  findYcRate: vi.fn(),
}))

vi.mock("@/lib/yellowcard/send-submit", () => ({
  submitYcSend: vi.fn(),
}))

vi.mock("@/lib/yellowcard/receive-submit", () => ({
  submitYcReceive: vi.fn(),
}))

vi.mock("@/lib/yellowcard/execute-yc-crypto-deposit", () => ({
  executeYcCryptoDeposit: vi.fn(),
}))

vi.mock("@/lib/yellowcard/kyc-metadata", () => ({
  buildYcKycPersonMetadata: vi.fn(),
}))

vi.mock("@/lib/payout-providers/yellowcard-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payout-providers/yellowcard-provider")>()
  return {
    ...actual,
    resolveYcSendChannelId: vi.fn(),
  }
})

vi.mock("@/lib/yellowcard/map-recipient-to-yc-send", () => ({
  mapRecipientToYcSend: vi.fn(),
}))

vi.mock("@/lib/yellowcard/channels", () => ({
  listYellowcardChannels: vi.fn(),
}))

vi.mock("@/lib/yellowcard/yc-receive-gate", () => ({
  isYcLocalPayInEnabledForCorridor: vi.fn(async () => true),
}))

vi.mock("@/lib/pay-in-limit-check", () => ({
  validateFundBalancePayInAmountLimits: vi.fn(async () => ({ ok: true })),
}))

vi.mock("@/lib/terminal/recipient-sell-prepare", () => ({
  resolveRecipientPayoutCountry: vi.fn(() => "US"),
}))

import { createCrossBorderTransfer, createCrossBorderDraft } from "./cross-border-orchestrator"

describe("createCrossBorderTransfer", () => {
  it("requires MoMo source phone and network", async () => {
    await expect(
      createCrossBorderTransfer({
        admin: {} as never,
        userId: "user-1",
        customerUID: "user-1",
        payInCurrency: "NGN",
        payInCountry: "NG",
        payInRail: "mobile_money",
        receiveAmount: 100,
        recipient: { id: "r-1", currency: "USD", country_code: "US" } as never,
        senderProfile: { residenceCountry: "NG" },
      }),
    ).rejects.toThrow("Mobile number and network are required")
  })
})

describe("createCrossBorderDraft", () => {
  it("is exported for legacy ops recovery", () => {
    expect(typeof createCrossBorderDraft).toBe("function")
  })
})

describe("TLC payout_review invariant", () => {
  it("uses Local Transfer constant for cross-border transfer method", () => {
    expect(TLC_LOCAL_TRANSFER_METHOD).toBe("Local Transfer")
  })
})
