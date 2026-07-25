import { describe, expect, it } from "vitest"
import {
  buildGridAccountDestination,
  buildGridBalancePayoutQuoteBody,
  buildGridCrossBorderQuoteBody,
  buildGridFundBalanceQuoteBody,
  buildGridRealtimeFundingSource,
  gridQuoteFeesUsd,
  gridQuoteSendingAmountMajor,
  pickGridInternalAccountForCurrency,
} from "./quote-request"

describe("buildGridRealtimeFundingSource", () => {
  it("sets REALTIME_FUNDING with SOLANA for USDC", () => {
    expect(
      buildGridRealtimeFundingSource({
        customerId: "Customer:abc",
        currency: "usdc",
      }),
    ).toEqual({
      sourceType: "REALTIME_FUNDING",
      customerId: "Customer:abc",
      currency: "USDC",
      cryptoNetwork: "SOLANA",
    })
  })

  it("omits cryptoNetwork for fiat source currencies", () => {
    expect(
      buildGridRealtimeFundingSource({
        customerId: "Customer:abc",
        currency: "NGN",
      }),
    ).toEqual({
      sourceType: "REALTIME_FUNDING",
      customerId: "Customer:abc",
      currency: "NGN",
    })
  })
})

describe("buildGridAccountDestination", () => {
  it("wraps external account id", () => {
    expect(buildGridAccountDestination("ExternalAccount:xyz")).toEqual({
      destinationType: "ACCOUNT",
      accountId: "ExternalAccount:xyz",
    })
  })
})

describe("buildGridBalancePayoutQuoteBody", () => {
  it("uses USDC realtime funding and RECEIVING lock", () => {
    expect(
      buildGridBalancePayoutQuoteBody({
        customerId: "Customer:abc",
        externalAccountId: "ExternalAccount:ngn",
        receiveCurrency: "NGN",
        lockedReceiveMinor: 100000,
      }),
    ).toEqual({
      source: {
        sourceType: "REALTIME_FUNDING",
        customerId: "Customer:abc",
        currency: "USDC",
        cryptoNetwork: "SOLANA",
      },
      destination: {
        destinationType: "ACCOUNT",
        accountId: "ExternalAccount:ngn",
      },
      lockedCurrencyAmount: 100000,
      lockedCurrencySide: "RECEIVING",
      purposeOfPayment: "FAMILY_SUPPORT",
    })
  })
})

describe("buildGridFundBalanceQuoteBody", () => {
  it("locks SENDING side for local pay-in", () => {
    expect(
      buildGridFundBalanceQuoteBody({
        customerId: "Customer:abc",
        sourceCurrency: "NGN",
        destinationInternalAccountId: "InternalAccount:usd",
        lockedSendMinor: 500000,
      }),
    ).toEqual({
      source: {
        sourceType: "REALTIME_FUNDING",
        customerId: "Customer:abc",
        currency: "NGN",
      },
      destination: {
        destinationType: "ACCOUNT",
        accountId: "InternalAccount:usd",
      },
      lockedCurrencyAmount: 500000,
      lockedCurrencySide: "SENDING",
    })
  })
})

describe("buildGridCrossBorderQuoteBody", () => {
  it("uses local currency funding to external account", () => {
    expect(
      buildGridCrossBorderQuoteBody({
        customerId: "Customer:abc",
        sourceCurrency: "NGN",
        externalAccountId: "ExternalAccount:dest",
        lockedReceiveMinor: 250000,
        purposeOfPayment: "GIFT",
      }),
    ).toMatchObject({
      lockedCurrencySide: "RECEIVING",
      purposeOfPayment: "GIFT",
      destination: { accountId: "ExternalAccount:dest" },
    })
  })
})

describe("pickGridInternalAccountForCurrency", () => {
  it("selects the ACTIVE USD account, not another currency", () => {
    expect(
      pickGridInternalAccountForCurrency(
        [
          {
            id: "InternalAccount:usdc",
            status: "ACTIVE",
            balance: { currency: { code: "USDC" } },
          },
          {
            id: "InternalAccount:usd",
            status: "ACTIVE",
            balance: { currency: { code: "USD" } },
          },
        ],
        "USD",
      ),
    ).toBe("InternalAccount:usd")
  })
})

describe("gridQuoteFeesUsd", () => {
  it("sums fiat quote fees in major units (2 decimals)", () => {
    expect(
      gridQuoteFeesUsd({
        sendingCurrency: { code: "USD", decimals: 2 },
        rateDetails: {
          gridApiFixedFee: 50,
          gridApiVariableFeeAmount: 25,
          counterpartyFixedFee: 25,
        },
      }),
    ).toBe(1)
  })

  it("sums USDC quote fees in major units (6 decimals)", () => {
    expect(
      gridQuoteFeesUsd({
        sendingCurrency: { code: "USDC", decimals: 6 },
        rateDetails: {
          gridApiFixedFee: 1_000_000,
          gridApiVariableFeeAmount: 500_000,
          counterpartyFixedFee: 500_000,
        },
      }),
    ).toBe(2)
  })
})

describe("gridQuoteSendingAmountMajor", () => {
  it("converts USDC minor units with 6 decimals", () => {
    expect(
      gridQuoteSendingAmountMajor({
        totalSendingAmount: 1_512_651,
        sendingCurrency: { code: "USDC", decimals: 6 },
      }),
    ).toBe(1.512651)
  })

  it("converts NGN minor units with 2 decimals", () => {
    expect(
      gridQuoteSendingAmountMajor({
        totalSendingAmount: 5_000_000,
        sendingCurrency: { code: "NGN", decimals: 2 },
      }),
    ).toBe(50_000)
  })
})
