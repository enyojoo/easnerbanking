import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/transactions/resolve-global-payout-off-ramp", () => ({
  resolveGlobalPayoutOffRampDetail: () => null,
}))

vi.mock("@easner/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@easner/shared")>()
  return {
    ...actual,
    isVerificationDepositMetadata: (metadata?: Record<string, unknown> | null) =>
      String(metadata?.deposit_kind ?? "").toLowerCase() === "verification",
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
  }
})

import {
  activityPrimaryLabel,
  activityStatusSuffix,
  activityAccountLabel,
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

  it("shows YC fund balance pay-in with local primary and USD impact in activity", () => {
    const [activity] = processRecentActivity([
      {
        id: "yc-fb-1",
        direction: "in",
        status: "settled",
        provider: "yellowcard",
        currency: "USD",
        amount: 65,
        metadata: {
          yc_mode: "fund_balance",
          local_pay_in: 100000,
          local_currency: "NGN",
          usd_credit: 65,
        },
        created_at: new Date().toISOString(),
      },
    ])
    expect(activity.amount).toContain("₦")
    expect(activity.amount).not.toContain("USD")
    expect(activity.impactFormatted).toBe("$65.00")
  })

  it("reads YC fund balance local pay-in from deposit_review snapshot", () => {
    const [activity] = processRecentActivity([
      {
        id: "yc-fb-review",
        direction: "in",
        status: "settled",
        provider: "yellowcard",
        currency: "USD",
        amount: 65,
        metadata: {
          yc_mode: "fund_balance",
          usd_credit: 65,
          deposit_review: {
            local_pay_in: 100000,
            local_currency: "NGN",
            usd_credit: 65,
            exchange_rate: 1538.46,
            pay_in_rail: "bank_transfer",
            credit_to: "USD Balance",
            residence_country: "NG",
            transfer_method: "Bank Transfer",
            processing_fee: 0,
          },
        },
        created_at: new Date().toISOString(),
      },
    ])
    expect(activity.amount).toContain("₦")
    expect(activity.impactFormatted).toBe("$65.00")
  })

  it("uses ledger local currency for YC fund balance when metadata only has usd_credit", () => {
    const [activity] = processRecentActivity([
      {
        id: "yc-fb-ledger-local",
        direction: "in",
        status: "settled",
        provider: "yellowcard",
        currency: "NGN",
        amount: 250000,
        metadata: {
          yc_mode: "fund_balance",
          usd_credit: 150,
        },
        created_at: new Date().toISOString(),
      },
    ])
    expect(activity.amount).toContain("₦")
    expect(activity.impactFormatted).toBe("$150.00")
  })

  it("infers YC fund balance local pay-in from usd_credit and customer_rate", () => {
    const [activity] = processRecentActivity([
      {
        id: "yc-fb-infer",
        direction: "in",
        status: "settled",
        provider: "yellowcard",
        currency: "USD",
        amount: 65,
        metadata: {
          yc_mode: "fund_balance",
          usd_credit: 65,
          local_currency: "NGN",
          customer_rate: 1538.46,
        },
        created_at: new Date().toISOString(),
      },
    ])
    expect(activity.amount).toContain("₦")
    expect(activity.impactFormatted).toBe("$65.00")
    expect(activity.amount).not.toBe(activity.impactFormatted)
  })

  it("uses deposit_review for fund balance when yc_mode is missing", () => {
    const [activity] = processRecentActivity([
      {
        id: "yc-fb-review-only",
        direction: "in",
        status: "settled",
        provider: "yellowcard",
        currency: "USD",
        amount: 80,
        metadata: {
          source: "api_yellowcard_fund_balance",
          usd_credit: 80,
          deposit_review: {
            local_pay_in: 120000,
            local_currency: "NGN",
            usd_credit: 80,
            exchange_rate: 1500,
            pay_in_rail: "bank_transfer",
            credit_to: "USD Balance",
            residence_country: "NG",
            transfer_method: "Bank Transfer",
            processing_fee: 0,
          },
        },
        created_at: new Date().toISOString(),
      },
    ])
    expect(activity.amount).toContain("₦")
    expect(activity.impactFormatted).toBe("$80.00")
  })

  it("uses fiat_deposit_amount for fund balance display when present", () => {
    const amount = formatOfficeTxAmount({
      id: "yc-fb-fiat",
      direction: "in",
      provider: "yellowcard",
      currency: "USD",
      amount: 90,
      metadata: {
        yc_mode: "fund_balance",
        usd_credit: 90,
        fiat_deposit_amount: 140000,
        fiat_deposit_currency: "NGN",
      },
    })
    expect(amount).toContain("₦")
    expect(amount).not.toContain("$")
  })

  it("aggregates pay-in and payout into one row per currency", () => {
    const { topCurrencies, volumeBalance } = computeProviderLedgerDashboardExtras([
      {
        id: "in-1",
        direction: "in",
        status: "settled",
        currency: "USD",
        amount: 50,
        metadata: { fiat_deposit_currency: "USD", fiat_deposit_amount: 50 },
      },
      {
        id: "out-1",
        direction: "out",
        status: "settled",
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
    expect(usd?.count).toBe(1)
    expect(usd?.totalAmount).toBe(50)
    expect(usd?.usdValue).toBe(50)
    expect(ngn?.totalAmount).toBe(80000)
    expect(ngn?.usdValue).toBe(50)
    expect(ngn?.dataOnly).toBe(true)
    expect(volumeBalance.USD.moneyIn).toBe(50)
    expect(volumeBalance.USD.moneyOut).toBe(50)
    expect(volumeBalance.USD.total).toBe(100)
  })

  it("excludes linked USD balance legs from top currencies on cross-currency payouts", () => {
    const { topCurrencies, volumeBalance } = computeProviderLedgerDashboardExtras([
      {
        id: "in-usd-1",
        direction: "in",
        status: "settled",
        currency: "USD",
        amount: 10,
        metadata: { fiat_deposit_currency: "USD", fiat_deposit_amount: 10 },
      },
      {
        id: "out-ngn-1",
        direction: "out",
        status: "settled",
        currency: "NGN",
        amount: 80000,
        metadata: {
          receive_currency: "NGN",
          receive_amount: 80000,
          send_currency: "USD",
          total_debited: 50,
        },
      },
      {
        id: "out-ngn-2",
        direction: "out",
        status: "settled",
        currency: "NGN",
        amount: 40000,
        metadata: {
          receive_currency: "NGN",
          receive_amount: 40000,
          send_currency: "USD",
          total_debited: 25,
        },
      },
    ])
    const usd = topCurrencies.find((r) => r.code === "USD")
    const ngn = topCurrencies.find((r) => r.code === "NGN")
    expect(usd?.count).toBe(1)
    expect(usd?.totalAmount).toBe(10)
    expect(usd?.usdValue).toBe(10)
    expect(ngn?.count).toBe(2)
    expect(ngn?.totalAmount).toBe(120000)
    expect(ngn?.usdValue).toBe(75)
    expect(ngn?.dataOnly).toBe(true)
    expect(volumeBalance.USD.moneyOut).toBe(75)
    expect(volumeBalance.USD.total).toBe(85)
    expect(topCurrencies[0]?.code).toBe("NGN")
    expect(topCurrencies[1]?.code).toBe("USD")
  })

  it("excludes verification deposits from volume KPIs but keeps them informational in top currencies", () => {
    const { topCurrencies, volumeBalance } = computeProviderLedgerDashboardExtras([
      {
        id: "in-funding",
        direction: "in",
        status: "settled",
        currency: "USD",
        amount: 100,
        metadata: { fiat_deposit_currency: "USD", fiat_deposit_amount: 100, deposit_kind: "funding" },
      },
      {
        id: "in-verification",
        direction: "in",
        status: "settled",
        currency: "USD",
        amount: 0.32,
        metadata: {
          fiat_deposit_currency: "USD",
          fiat_deposit_amount: 0.32,
          deposit_kind: "verification",
        },
      },
    ])
    const usd = topCurrencies.find((r) => r.code === "USD")
    expect(volumeBalance.USD.moneyIn).toBe(100)
    expect(volumeBalance.USD.total).toBe(100)
    expect(usd?.count).toBe(2)
    expect(usd?.totalAmount).toBe(100)
    expect(usd?.usdValue).toBe(100)
    expect(usd?.dataOnly).toBeUndefined()
  })

  it("marks verification-only currency rows as dataOnly in top currencies", () => {
    const { topCurrencies, volumeBalance } = computeProviderLedgerDashboardExtras([
      {
        id: "in-verification",
        direction: "in",
        status: "settled",
        currency: "USD",
        amount: 0.32,
        metadata: {
          fiat_deposit_currency: "USD",
          fiat_deposit_amount: 0.32,
          deposit_kind: "verification",
        },
      },
    ])
    expect(volumeBalance.USD.total).toBe(0)
    expect(topCurrencies[0]?.code).toBe("USD")
    expect(topCurrencies[0]?.dataOnly).toBe(true)
    expect(topCurrencies[0]?.usdValue).toBe(0)
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
    expect(buckets).toEqual([{ code: "EUR", flow: "pay_in", amount: 200, dataOnly: false }])
  })

  it("extractCurrencyBuckets denotes USDC as USD", () => {
    const buckets = extractCurrencyBuckets({
      id: "usdc",
      direction: "in",
      currency: "USDC",
      amount: 80,
      metadata: { fiat_deposit_currency: "USDC", fiat_deposit_amount: 80 },
    })
    expect(buckets).toEqual([{ code: "USD", flow: "pay_in", amount: 80, dataOnly: false }])
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

  it("activityAccountLabel prefers business name over owner", () => {
    const account = activityAccountLabel({
      id: "biz-tx",
      business_id: "biz-1",
      business: { id: "biz-1", name: "Acme Payments Ltd" },
      user: {
        first_name: "Jane",
        last_name: "Owner",
        email: "jane@example.com",
        full_name: "Jane Owner",
      },
    })
    expect(account).toEqual({ label: "Acme Payments Ltd", kind: "business" })
  })

  it("activityAccountLabel falls back to individual user", () => {
    const account = activityAccountLabel({
      id: "ind-tx",
      user: {
        first_name: null,
        last_name: null,
        email: "alex@example.com",
        full_name: "Alex Individual",
      },
    })
    expect(account).toEqual({ label: "Alex Individual", kind: "individual" })
  })

  it("counts YC cross-border volume from reporting_usd_amount, not local ledger amount", () => {
    const { volumeBalance, ycVolumeBreakdown } = computeProviderLedgerDashboardExtras([
      {
        id: "yc-cb-1",
        direction: "out",
        status: "settled",
        provider: "yellowcard",
        currency: "NGN",
        amount: 500000,
        metadata: {
          yc_mode: "cross_border_send",
          reporting_usd_amount: 320.5,
          receive_currency: "KES",
          receive_amount: 42000,
        },
      },
    ])
    expect(volumeBalance.USD.moneyOut).toBe(320.5)
    expect(volumeBalance.USD.total).toBe(320.5)
    expect(ycVolumeBreakdown.cross_border_send.count).toBe(1)
    expect(ycVolumeBreakdown.cross_border_send.usdVolume).toBe(320.5)
  })

  it("counts YC fund_balance pay-in from usd_credit metadata", () => {
    const { volumeBalance, ycVolumeBreakdown } = computeProviderLedgerDashboardExtras([
      {
        id: "yc-fb-1",
        direction: "in",
        status: "settled",
        provider: "yellowcard",
        currency: "NGN",
        amount: 250000,
        metadata: {
          yc_mode: "fund_balance",
          usd_credit: 150,
          local_pay_in: 250000,
        },
      },
    ])
    expect(volumeBalance.USD.moneyIn).toBe(150)
    expect(ycVolumeBreakdown.fund_balance.usdVolume).toBe(150)
  })

  it("does not infer cross-border volume when reporting snapshot is missing", () => {
    const { volumeBalance } = computeProviderLedgerDashboardExtras([
      {
        id: "yc-cb-missing",
        direction: "out",
        status: "settled",
        provider: "yellowcard",
        currency: "NGN",
        amount: 500000,
        metadata: {
          yc_mode: "cross_border_send",
          receive_currency: "KES",
          receive_amount: 42000,
        },
      },
    ])
    expect(volumeBalance.USD.total).toBe(0)
  })

  it("folds USDC into USD for top currencies and volume", () => {
    const { topCurrencies, volumeBalance } = computeProviderLedgerDashboardExtras([
      {
        id: "usdc-in",
        direction: "in",
        status: "confirmed",
        currency: "USDC",
        amount: 80,
        metadata: { fiat_deposit_currency: "USDC", fiat_deposit_amount: 80 },
      },
    ])
    expect(topCurrencies.map((r) => r.code)).toEqual(["USD"])
    expect(topCurrencies[0]?.count).toBe(1)
    expect(topCurrencies[0]?.usdValue).toBe(80)
    expect(volumeBalance.USD.moneyIn).toBe(80)
  })

  it("counts confirmed money in/out and ignores pending and failed", () => {
    const { volumeBalance, topCurrencies } = computeProviderLedgerDashboardExtras([
      {
        id: "confirmed-in",
        direction: "in",
        status: "confirmed",
        currency: "USD",
        amount: 40,
        metadata: { fiat_deposit_currency: "USD", fiat_deposit_amount: 40 },
      },
      {
        id: "pending-in",
        direction: "in",
        status: "pending",
        currency: "USD",
        amount: 999,
        metadata: { fiat_deposit_currency: "USD", fiat_deposit_amount: 999 },
      },
      {
        id: "failed-out",
        direction: "out",
        status: "failed",
        currency: "USD",
        amount: 25,
        metadata: { send_currency: "USD", total_debited: 25 },
      },
    ])
    expect(volumeBalance.USD.moneyIn).toBe(40)
    expect(volumeBalance.USD.moneyOut).toBe(0)
    expect(topCurrencies).toHaveLength(1)
    expect(topCurrencies[0]?.count).toBe(1)
    expect(topCurrencies[0]?.usdValue).toBe(40)
  })

  it("ranks top currencies by txn count then USD value", () => {
    const { topCurrencies } = computeProviderLedgerDashboardExtras([
      {
        id: "usd-large",
        direction: "in",
        status: "settled",
        currency: "USD",
        amount: 500,
        metadata: { fiat_deposit_currency: "USD", fiat_deposit_amount: 500 },
      },
      {
        id: "ngn-1",
        direction: "out",
        status: "confirmed",
        currency: "NGN",
        amount: 80000,
        metadata: {
          receive_currency: "NGN",
          receive_amount: 80000,
          send_currency: "USD",
          total_debited: 50,
        },
      },
      {
        id: "ngn-2",
        direction: "out",
        status: "settled",
        currency: "NGN",
        amount: 40000,
        metadata: {
          receive_currency: "NGN",
          receive_amount: 40000,
          send_currency: "USD",
          total_debited: 25,
        },
      },
    ])
    expect(topCurrencies.map((r) => r.code)).toEqual(["NGN", "USD"])
    expect(topCurrencies[0]?.count).toBe(2)
    expect(topCurrencies[0]?.usdValue).toBe(75)
    expect(topCurrencies[1]?.count).toBe(1)
    expect(topCurrencies[1]?.usdValue).toBe(500)
  })
})
