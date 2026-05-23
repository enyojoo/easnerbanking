import { describe, expect, it } from "vitest"
import type { ExchangeRate } from "./types"
import {
  buildManualSendPayInCurrencies,
  listManualPayInOptionsForCurrency,
  pickDefaultManualPayInOption,
  routeManualPayInScreen,
} from "./manual-send-catalog"

function rate(from: string, to: string): ExchangeRate {
  return {
    id: "1",
    from_currency: from,
    to_currency: to,
    rate: 100,
    fee_type: "free",
    fee_amount: 0,
    status: "active",
    created_at: "",
    updated_at: "",
  }
}

describe("manual-send-catalog", () => {
  it("buildManualSendPayInCurrencies intersects rates and PM", () => {
    const codes = buildManualSendPayInCurrencies({
      exchangeRates: [rate("USD", "XOF"), rate("EUR", "XOF")],
      paymentMethods: [
        { id: "1", currency: "USD", name: "Bank", type: "bank_account", is_default: true, status: "active" },
        { id: "2", currency: "KES", name: "M-Pesa", type: "mobile_money", is_default: true, status: "active" },
      ],
    })
    expect(codes).toEqual(["USD"])
  })

  it("lists multiple PM options per currency", () => {
    const opts = listManualPayInOptionsForCurrency(
      [
        {
          id: "a",
          currency: "KES",
          name: "M-Pesa",
          type: "mobile_money",
          is_default: false,
          status: "active",
          display_logo_url: "https://cdn.example/mpesa.png",
        },
        { id: "b", currency: "KES", name: "Bank Transfer", type: "bank_account", is_default: true, status: "active" },
      ],
      "KES",
    )
    expect(opts.map((o) => o.name)).toEqual(["Bank Transfer", "M-Pesa"])
    expect(pickDefaultManualPayInOption(opts)?.id).toBe("b")
    expect(opts.find((o) => o.id === "a")?.display_logo_url).toBe("https://cdn.example/mpesa.png")
  })

  it("routeManualPayInScreen maps types", () => {
    expect(routeManualPayInScreen("mobile_money")).toBe("mobile_money")
    expect(routeManualPayInScreen("stablecoin")).toBe("stablecoin")
  })
})
