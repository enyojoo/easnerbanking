import { describe, expect, it } from "vitest"
import {
  buildExpressDepositsPricing,
  buildExpressDepositsReviewRows,
  parseExpressStripeQuoteFees,
  pickExpressSolanaUsdcQuote,
} from "./express-deposits-pricing"
import { REVIEW_ROW_LABELS } from "./review-row-labels"

describe("pickExpressSolanaUsdcQuote", () => {
  it("selects solana usdc network quote", () => {
    const picked = pickExpressSolanaUsdcQuote({
      destination_network_quotes: {
        solana: [
          {
            destination_currency: "usdc",
            destination_amount: "100",
            source_total_amount: "104.05",
            fees: { transaction_fee_monetary: "4.04", network_fee_monetary: "0.01" },
          },
        ],
      },
    })
    expect(picked?.destination_amount).toBe("100")
    expect(picked?.source_total_amount).toBe("104.05")
  })
})

describe("buildExpressDepositsPricing", () => {
  it("buyer pays stripe fees with zero easner bps", () => {
    const quote = pickExpressSolanaUsdcQuote({
      destination_network_quotes: {
        solana: [
          {
            destination_currency: "usdc",
            destination_amount: "100",
            source_amount: "100",
            source_total_amount: "104.05",
            fees: { transaction_fee_monetary: "4.04", network_fee_monetary: "0.01" },
          },
        ],
      },
    })
    const fees = parseExpressStripeQuoteFees(quote, 104.05)
    expect(fees.total).toBe(4.05)

    const pricing = buildExpressDepositsPricing({
      usdCredit: 100,
      sourceCurrency: "USD",
      stripeQuote: quote,
      payInBps: 0,
    })
    expect(pricing?.totalToPay).toBe(104.05)
    expect(pricing?.displayProcessingFee).toBe(4.05)
    expect(pricing?.easnerProcessingFeeUsd).toBe(0)
  })

  it("stacks easner bps on stripe total", () => {
    const quote = pickExpressSolanaUsdcQuote({
      destination_network_quotes: {
        solana: [
          {
            destination_currency: "usdc",
            destination_amount: "100",
            source_total_amount: "104.05",
            fees: { transaction_fee_monetary: "4.04", network_fee_monetary: "0.01" },
          },
        ],
      },
    })
    const pricing = buildExpressDepositsPricing({
      usdCredit: 100,
      sourceCurrency: "USD",
      stripeQuote: quote,
      payInBps: 100,
    })
    expect(pricing?.easnerProcessingFeeUsd).toBe(1)
    expect(pricing?.totalToPay).toBe(105.05)
    expect(pricing?.displayProcessingFee).toBe(5.05)
  })

  it("builds EUR review rows with exchange rate", () => {
    const quote = pickExpressSolanaUsdcQuote({
      destination_network_quotes: {
        solana: [
          {
            destination_currency: "usdc",
            destination_amount: "50",
            source_amount: "45",
            source_total_amount: "46.2",
            fees: { transaction_fee_monetary: "1.1", network_fee_monetary: "0.1" },
          },
        ],
      },
    })
    const pricing = buildExpressDepositsPricing({
      usdCredit: 50,
      sourceCurrency: "EUR",
      stripeQuote: quote,
      payInBps: 0,
      rateFetchedAt: 1_700_000_000,
    })!
    const rows = buildExpressDepositsReviewRows({
      pricing,
      method: "express_card",
    })
    const labels = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(labels[REVIEW_ROW_LABELS.exchangeRate]).toBeTruthy()
    expect(labels[REVIEW_ROW_LABELS.amountToCredit]).toContain("50")
    expect(labels[REVIEW_ROW_LABELS.totalToPay]).toContain("46.2")
  })
})
