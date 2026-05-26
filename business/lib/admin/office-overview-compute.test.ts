import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/transactions/resolve-global-payout-off-ramp", () => ({
  resolveGlobalPayoutOffRampDetail: () => null,
}))

vi.mock("@easner/shared", () => ({
  isVerificationDepositMetadata: () => false,
  toEasnerTransactionPrimaryLabel: (input: {
    direction: string
    metadata?: Record<string, unknown> | null
  }) => {
    const meta = input.metadata || {}
    if (String(meta.source) === "easetag_p2p" && input.direction === "in") {
      const tag = typeof meta.sender_easetag === "string" ? meta.sender_easetag : ""
      return tag ? `Received from @${tag}` : "Easetag Received"
    }
    if (typeof meta.sender_name === "string" && meta.sender_name.trim()) return meta.sender_name.trim()
    return input.direction === "in" ? "Bank Deposit" : "Bank Transfer"
  },
  formatMoneyDisplay: (amount: number, currency: string) => {
    const sym =
      currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "NGN" ? "₦" : currency
    return `${sym}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  },
}))

import {
  activityPrimaryLabel,
  activityStatusSuffix,
  computeProviderLedgerDashboardExtras,
  extractCurrencyBuckets,
  formatOfficeTxAmount,
  processRecentActivity,
  resolveOfficeTxPresentation,
  volumeUsdContribution,
} from "./office-overview-compute"

describe("office-overview-compute", () => {
  it("labels bank pay-in with remitter, not generic transfer created", () => {
    const msg = processRecentActivity([
      {
        id: "1",
        direction: "in",
        status: "pending",
        currency: "USD",
        amount: 100,
        provider: "noah",
        metadata: {
          fiat_deposit_currency: "USD",
          fiat_deposit_amount: 100,
          sender_name: "Acme Corp",
        },
        created_at: new Date().toISOString(),
      },
    ])[0]
    expect(msg.message).toContain("Acme Corp")
    expect(msg.message).not.toContain("Pending")
    expect(msg.message).not.toContain("Transfer created")
    expect(msg.amount).toMatch(/^\$/)
    expect(msg.amount).not.toContain("USD")
  })

  it("shows payout in local currency with symbol for activity", () => {
    const amount = formatOfficeTxAmount({
      id: "out-1",
      direction: "out",
      currency: "NGN",
      amount: 80000,
      base_currency: "USD",
      base_amount: 50,
      metadata: {
        receive_currency: "NGN",
        receive_amount: 80000,
        send_currency: "USD",
        total_debited: 50,
      },
    })
    expect(amount).toContain("₦")
    expect(amount).not.toContain("NGN")
  })

  it("aggregates pay-in and payout into one row per currency", () => {
    const { topCurrencies, volumeBalance } = computeProviderLedgerDashboardExtras([
      {
        id: "in-1",
        direction: "in",
        currency: "USD",
        amount: 50,
        metadata: { fiat_deposit_currency: "USD", fiat_deposit_amount: 50 },
      },
      {
        id: "out-1",
        direction: "out",
        currency: "NGN",
        amount: 80000,
        base_currency: "USD",
        base_amount: 50,
        metadata: {
          receive_currency: "NGN",
          receive_amount: 80000,
          send_currency: "USD",
          total_debited: 50,
        },
      },
    ])
    const usd = topCurrencies.find((r) => r.code === "USD")
    const ngn = topCurrencies.find((r) => r.code === "NGN")
    expect(usd?.count).toBe(2)
    expect(usd?.totalAmount).toBe(100)
    expect(ngn?.totalAmount).toBe(80000)
    expect(volumeBalance.USD.moneyIn).toBe(50)
    expect(volumeBalance.USD.moneyOut).toBe(50)
    expect(volumeBalance.USD.total).toBe(100)
  })

  it("sums USD volume from balance leg on payout rows", () => {
    expect(
      volumeUsdContribution({
        id: "a",
        direction: "out",
        base_currency: "USD",
        base_amount: 25,
        currency: "NGN",
        amount: 40000,
        metadata: { receive_currency: "NGN", receive_amount: 40000, send_currency: "USD", total_debited: 25 },
      }),
    ).toBe(25)
  })

  it("resolveOfficeTxPresentation uses EUR pay-in for balance", () => {
    const pres = resolveOfficeTxPresentation({
      id: "x",
      direction: "in",
      currency: "EUR",
      amount: 1,
      metadata: { fiat_deposit_currency: "EUR", fiat_deposit_amount: 200 },
    })
    expect(pres.displayCurrency).toBe("EUR")
    expect(pres.displayAmount).toBe(200)
    expect(pres.balanceCurrency).toBe("EUR")
    expect(pres.balanceAmount).toBe(200)
  })

  it("extractCurrencyBuckets returns pay-in flow", () => {
    const buckets = extractCurrencyBuckets({
      id: "x",
      direction: "in",
      currency: "EUR",
      amount: 1,
      metadata: { fiat_deposit_currency: "EUR", fiat_deposit_amount: 200 },
    })
    expect(buckets).toEqual([{ code: "EUR", flow: "pay_in", amount: 200 }])
  })

  it("activityStatusSuffix maps settled to Completed", () => {
    expect(activityStatusSuffix("settled")).toBe("Completed")
  })

  it("activityPrimaryLabel uses easetag receive copy", () => {
    const label = activityPrimaryLabel({
      id: "e",
      provider: "easner_internal",
      direction: "in",
      metadata: { source: "easetag_p2p", sender_easetag: "jane" },
    })
    expect(label).toContain("@jane")
  })
})
