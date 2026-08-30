import { describe, expect, it } from "vitest"
import {
  buildExpressDepositsPricing,
  buildExpressDepositsReviewRows,
  expressDepositsOnrampQuoteLock,
  expressDepositsQuoteMatchesEntered,
  expressDepositsSessionCreateParams,
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
    expect(pricing.amountEntryMode).toBe("usd")
  })

  it("locks Stripe quotes and sessions on the typed side", () => {
    expect(expressDepositsOnrampQuoteLock({ amountEntryMode: "usd", usdCredit: 50 })).toEqual({
      destination_amount: "50",
    })
    expect(expressDepositsOnrampQuoteLock({ amountEntryMode: "pay", youPay: 46.2 })).toEqual({
      source_amount: "46.2",
    })
    const quote = pickExpressSolanaUsdcQuote({
      destination_network_quotes: {
        solana: [
          {
            destination_currency: "usdc",
            destination_amount: "50",
            source_amount: "46.2",
            source_total_amount: "47.4",
            fees: { transaction_fee_monetary: "1.2", network_fee_monetary: "0" },
          },
        ],
      },
    })
    const payPricing = buildExpressDepositsPricing({
      usdCredit: 0,
      sourceCurrency: "EUR",
      stripeQuote: quote,
      payInBps: 0,
      amountEntryMode: "pay",
      quotedAmount: 46.2,
    })!
    expect(payPricing.usdCredit).toBe(50)
    expect(payPricing.quotedAmount).toBe(46.2)
    expect(
      expressDepositsQuoteMatchesEntered({
        pricing: payPricing,
        amountEntryMode: "pay",
        enteredAmount: 46.2,
      }),
    ).toBe(true)
    expect(
      expressDepositsSessionCreateParams({
        pricing: payPricing,
        baseParams: { destination_currency: "usdc" },
      }),
    ).toEqual({ destination_currency: "usdc", source_amount: "46.2" })
    expect(
      expressDepositsSessionCreateParams({
        pricing: { ...payPricing, amountEntryMode: "usd" },
        baseParams: { destination_currency: "usdc" },
      }).destination_amount,
    ).toBe("50")
  })

  it("builds review rows for every Express method", () => {
    const quote = pickExpressSolanaUsdcQuote({
      destination_network_quotes: {
        solana: [
          {
            destination_currency: "usdc",
            destination_amount: "40",
            source_total_amount: "41.2",
            fees: { transaction_fee_monetary: "1.2", network_fee_monetary: "0" },
          },
        ],
      },
    })
    const usdPricing = buildExpressDepositsPricing({
      usdCredit: 40,
      sourceCurrency: "USD",
      stripeQuote: quote,
      payInBps: 0,
    })!
    const titles = {
      express_card: "Card",
      express_apple_pay: "Apple Pay",
      express_google_pay: "Google Pay",
      express_ach: "ACH Direct",
    } as const
    for (const method of Object.keys(titles) as Array<keyof typeof titles>) {
      const rows = buildExpressDepositsReviewRows({ pricing: usdPricing, method })
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.value]))
      expect(byId["amount-to-credit"]).toContain("40")
      expect(byId["total-to-pay"]).toContain("41.2")
      expect(byId["deposit-method"]).toBe(titles[method])
    }
  })
})
