import { describe, expect, it } from "vitest"
import {
  isRelayRequestTerminalV3,
  mapRelayRequestStatusV3,
  parseRelayFeesV3,
  parseRelayRouteAmountsV3,
} from "../requests-v3"
import type { RelayRequestV3 } from "../types"

const v3SuccessFixture: RelayRequestV3 = {
  id: "0xabc",
  status: "success",
  data: {
    fees: {
      quoted: {
        swap: { usd: "-1.999380", amount: "1999380", amountFormatted: "1.99938" },
        execution: { usd: "-0.001160", amount: "1160", amountFormatted: "0.00116" },
        platform: { usd: "0.000000", amount: "0", amountFormatted: "0" },
        app: { usd: "-4.998625", amount: "5000000", amountFormatted: "5.0" },
        sponsored: { usd: "6.999165", amount: "7001090", amountFormatted: "7.00109" },
      },
      actual: {
        swap: { usd: "-1.999380" },
        execution: { usd: "-0.001160" },
        platform: { usd: "0.000000" },
        app: { usd: "-4.998625" },
        sponsored: { usd: "6.999165" },
      },
    },
    feeSponsorship: {
      actual: {
        sponsoredTotal: { amountUsd: "6.999165" },
        userPaysTotal: { amountUsd: "0" },
      },
    },
    route: {
      quoted: {
        origin: {
          inputCurrency: {
            amount: "100000000",
            amountFormatted: "100.0",
            currency: { decimals: 6 },
          },
        },
        destination: {
          outputCurrency: {
            amount: "98760000",
            amountFormatted: "98.76",
            currency: { decimals: 6 },
          },
        },
      },
      actual: {
        rate: "1",
        origin: {
          inputCurrency: {
            amount: "100000000",
            amountFormatted: "100.0",
            currency: { decimals: 6 },
          },
        },
        destination: {
          outputCurrency: {
            amount: "98760000",
            amountFormatted: "98.76",
            currency: { decimals: 6 },
          },
        },
      },
    },
    outTxs: [{ txHash: "0xfill123" }],
  },
}

describe("parseRelayFeesV3", () => {
  it("sums swap + execution + platform + app from actual phase", () => {
    const fees = parseRelayFeesV3(v3SuccessFixture)
    expect(fees.actualUsd).toBeCloseTo(7.0, 0)
    expect(fees.sponsoredUsd).toBeCloseTo(6.999165, 3)
    expect(fees.userPaysUsd).toBe(0)
  })
})

describe("parseRelayRouteAmountsV3", () => {
  it("reads deposited and received from route.actual", () => {
    const route = parseRelayRouteAmountsV3(v3SuccessFixture)
    expect(route.deposited).toBe(100)
    expect(route.received).toBe(98.76)
    expect(route.rate).toBe(1)
  })
})

describe("isRelayRequestTerminalV3", () => {
  it("treats success failure refund as terminal", () => {
    expect(isRelayRequestTerminalV3("success")).toBe(true)
    expect(isRelayRequestTerminalV3("failure")).toBe(true)
    expect(isRelayRequestTerminalV3("depositing")).toBe(false)
  })

  it("maps to internal status", () => {
    expect(mapRelayRequestStatusV3("success")).toBe("settled")
    expect(mapRelayRequestStatusV3("failure")).toBe("failed")
    expect(mapRelayRequestStatusV3("pending")).toBe("pending")
  })
})
