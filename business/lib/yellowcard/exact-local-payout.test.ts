import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

vi.mock("./account-balance", () => ({
  fetchYcAvailableBalance: vi.fn(),
}))

vi.mock("./send-fee-config", () => ({
  fetchYcSendServiceFeeConfig: vi.fn(),
}))

import { fetchYcAvailableBalance } from "./account-balance"
import { fetchYcSendServiceFeeConfig } from "./send-fee-config"
import {
  assertYcExactLocalCredit,
  getYcExactLocalFloatBufferUsd,
  isYcExactLocalPayoutEnabled,
  planYcExactLocalPayout,
} from "./exact-local-payout"

const NGN_BANK_BALANCE_FEE = { minFeeLocal: 0, feePercentage: 0, flatFeeLocal: 100 }
const TOPUP = "8o6TmfQmUwmSDrURE8WJCwGkPwaVLXhWc5FXUw1PJDQU"

const originalEnv = { ...process.env }

const NGN_BANK = {
  receiveAmount: 2000,
  ycSellRate: 1373,
  country: "NG",
  currency: "NGN",
  channelType: "bank" as const,
}

describe("planYcExactLocalPayout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.YC_EXACT_LOCAL_PAYOUT = "true"
    process.env.YELLOWCARD_USDC_TOPUP_ADDRESS_SOL = TOPUP
    process.env.YC_EXACT_LOCAL_FLOAT_BUFFER_USD = "5"
    vi.mocked(fetchYcAvailableBalance).mockResolvedValue(50)
    vi.mocked(fetchYcSendServiceFeeConfig).mockResolvedValue(NGN_BANK_BALANCE_FEE)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("prices 2000 NGN as recipient credit plus the flat service fee", async () => {
    const plan = await planYcExactLocalPayout({ ...NGN_BANK })

    expect(plan.eligible).toBe(true)
    expect(plan.feeLocal).toBe(100)
    expect(plan.grossLocal).toBe(2100)
    // (2000 + 100) / 1373, ceiled to 6dp so the float is never short.
    expect(plan.costUsd).toBe(1.529498)
    expect(plan.topupAddress).toBe(TOPUP)
  })

  it("prices off the balance-settlement fee schedule, not direct settlement", async () => {
    await planYcExactLocalPayout({ ...NGN_BANK })

    // Direct settlement charges 1% (20 NGN here) — pricing against it under-funds the float.
    expect(fetchYcSendServiceFeeConfig).toHaveBeenCalledWith({
      country: "NG",
      currency: "NGN",
      channelType: "bank",
      directSettlement: false,
    })
  })

  it("falls back when a required float cushion cannot cover cost plus buffer", async () => {
    process.env.YC_EXACT_LOCAL_FLOAT_BUFFER_USD = "5"
    vi.mocked(fetchYcAvailableBalance).mockResolvedValue(5.5)
    const plan = await planYcExactLocalPayout({ ...NGN_BANK })

    expect(plan.eligible).toBe(false)
    expect(plan.reason).toBe("insufficient_yc_float")
    expect(plan.costUsd).toBe(1.529498)
  })

  it("is eligible with a zero float when no cushion is required (user sweep funds it)", async () => {
    process.env.YC_EXACT_LOCAL_FLOAT_BUFFER_USD = "0"
    vi.mocked(fetchYcAvailableBalance).mockResolvedValue(0)
    const plan = await planYcExactLocalPayout({ ...NGN_BANK })

    expect(plan.eligible).toBe(true)
    expect(plan.costUsd).toBe(1.529498)
    expect(plan.topupAddress).toBe(TOPUP)
  })

  it("falls back when the corridor fee config is unknown", async () => {
    vi.mocked(fetchYcSendServiceFeeConfig).mockResolvedValue(null)
    const plan = await planYcExactLocalPayout({ ...NGN_BANK })

    expect(plan.eligible).toBe(false)
    expect(plan.reason).toBe("missing_fee_config")
    expect(fetchYcAvailableBalance).not.toHaveBeenCalled()
  })

  it("falls back when no top-up address is configured", async () => {
    delete process.env.YELLOWCARD_USDC_TOPUP_ADDRESS_SOL
    const plan = await planYcExactLocalPayout({ ...NGN_BANK })

    expect(plan.eligible).toBe(false)
    expect(plan.reason).toBe("missing_topup_address")
  })

  it("is disabled unless the flag is explicitly on", async () => {
    delete process.env.YC_EXACT_LOCAL_PAYOUT
    expect(isYcExactLocalPayoutEnabled()).toBe(false)
    const plan = await planYcExactLocalPayout({ ...NGN_BANK })
    expect(plan.reason).toBe("exact_local_disabled")
  })

  it("defaults the float buffer to 0 (user-funded) when unset or invalid", () => {
    delete process.env.YC_EXACT_LOCAL_FLOAT_BUFFER_USD
    expect(getYcExactLocalFloatBufferUsd()).toBe(0)
    process.env.YC_EXACT_LOCAL_FLOAT_BUFFER_USD = "not-a-number"
    expect(getYcExactLocalFloatBufferUsd()).toBe(0)
    process.env.YC_EXACT_LOCAL_FLOAT_BUFFER_USD = "25"
    expect(getYcExactLocalFloatBufferUsd()).toBe(25)
  })
})

describe("assertYcExactLocalCredit", () => {
  it("accepts a credit equal to the quote", () => {
    const credited = assertYcExactLocalCredit({
      quotedReceive: 2000,
      sendRes: { convertedAmount: 2000 },
      receiveCurrency: "NGN",
    })
    expect(credited).toBe(2000)
  })

  it("rejects the overshoot that direct settlement would have produced", () => {
    expect(() =>
      assertYcExactLocalCredit({
        quotedReceive: 2000,
        sendRes: { convertedAmount: 2011.72 },
        receiveCurrency: "NGN",
      }),
    ).toThrow(/locked 2011.72 NGN for an exact 2000 NGN payout/)
  })

  it("accepts a fee charged on top of the recipient's credit", () => {
    // 1.529498 USD × 1373 = 2100 NGN = credit + fee, so the recipient keeps the full 2000.
    const credited = assertYcExactLocalCredit({
      quotedReceive: 2000,
      sendRes: {
        convertedAmount: 2000,
        serviceFeeAmountLocal: 100,
        amount: 1.529498,
        rate: 1373,
      },
      receiveCurrency: "NGN",
    })
    expect(credited).toBe(2000)
  })

  it("rejects a fee taken out of the recipient's credit", () => {
    // 1.456664 USD × 1373 = 2000 NGN total, so the recipient would receive only 1900.
    expect(() =>
      assertYcExactLocalCredit({
        quotedReceive: 2000,
        sendRes: {
          convertedAmount: 2000,
          serviceFeeAmountLocal: 100,
          amount: 1.456664,
          rate: 1373,
        },
        receiveCurrency: "NGN",
      }),
    ).toThrow(/come out of the recipient's credit/)
  })

  it("rejects any shortfall", () => {
    expect(() =>
      assertYcExactLocalCredit({
        quotedReceive: 2000,
        sendRes: { convertedAmount: 1998.13 },
        receiveCurrency: "NGN",
      }),
    ).toThrow(/1998.13/)
  })
})
