import { describe, expect, it } from "vitest"
import {
  computeYcFundBalanceAmountPreview,
  resolveAmountScreenPayInPreview,
  resolveAmountScreenPayoutPreview,
  resolveAmountScreenTlcPreview,
  resolveAmountScreenWalletPreview,
} from "./index"

describe("resolveAmountScreenPayInPreview", () => {
  const ratePreview = computeYcFundBalanceAmountPreview({
    amountEntryMode: "usd",
    enteredAmount: 500,
    customerSellRate: 1636,
    ycSellRate: 1620,
    rail: "bank_transfer",
  })

  it("uses estimated all-in local, not principal, before a quote lands", () => {
    expect(ratePreview).not.toBeNull()
    const display = resolveAmountScreenPayInPreview({
      amountEntryMode: "usd",
      enteredAmount: 500,
      customerRate: 1636,
      ratePreview,
    })
    const principal = 500 * 1636
    expect(display.principalLocal).toBeCloseTo(principal, 0)
    expect(display.localPayIn).toBeGreaterThan(display.principalLocal)
    expect(display.localPayIn).toBe(ratePreview!.estimatedTotalLocalPayIn)
    expect(display.feeInclusive).toBe(true)
    expect(display.source).toBe("rate")
  })

  it("upgrades to quote localPayIn when usd credit matches", () => {
    expect(ratePreview).not.toBeNull()
    const display = resolveAmountScreenPayInPreview({
      amountEntryMode: "usd",
      enteredAmount: 500,
      customerRate: 1636,
      ratePreview,
      quote: {
        usdCredit: 500,
        localPayIn: 850_123,
        customerRate: 1636,
      },
    })
    expect(display.localPayIn).toBe(850_123)
    expect(display.usdCredit).toBe(500)
    expect(display.feeInclusive).toBe(true)
    expect(display.source).toBe("quote")
  })

  it("does not overlay a quote for a different usd credit", () => {
    expect(ratePreview).not.toBeNull()
    const display = resolveAmountScreenPayInPreview({
      amountEntryMode: "usd",
      enteredAmount: 500,
      customerRate: 1636,
      ratePreview,
      quote: {
        usdCredit: 400,
        localPayIn: 680_000,
        customerRate: 1636,
      },
    })
    expect(display.source).toBe("rate")
    expect(display.localPayIn).toBe(ratePreview!.estimatedTotalLocalPayIn)
  })
})

describe("resolveAmountScreenPayoutPreview", () => {
  it("receive-mode counterpart is principal plus bps before a quote", () => {
    const display = resolveAmountScreenPayoutPreview({
      amountEntryMode: "receive",
      principalSend: 100,
      principalReceive: 163_600,
      customerRate: 1636,
    })
    expect(display.youSendAmount).toBe(100)
    expect(display.totalDebited).toBeCloseTo(101, 2)
    expect(display.receiveAmount).toBe(163_600)
    expect(display.feeInclusive).toBe(true)
    expect(display.source).toBe("rate")
  })

  it("receive-mode counterpart is totalDebited once quoted, not principal", () => {
    const display = resolveAmountScreenPayoutPreview({
      amountEntryMode: "receive",
      principalSend: 100,
      principalReceive: 163_600,
      customerRate: 1636,
      quote: {
        youSendAmount: 100,
        totalDebited: 104.25,
        recipientGetsAmount: 163_600,
        customerRate: 1636,
      },
    })
    expect(display.totalDebited).toBe(104.25)
    expect(display.youSendAmount).toBe(100)
    expect(display.receiveAmount).toBe(163_600)
    expect(display.source).toBe("quote")
  })

  it("send-mode toggle seed stays youSendAmount principal, not totalDebited", () => {
    const display = resolveAmountScreenPayoutPreview({
      amountEntryMode: "send",
      principalSend: 99.5,
      principalReceive: 163_000,
      customerRate: 1636,
      quote: {
        youSendAmount: 99.5,
        totalDebited: 104.25,
        recipientGetsAmount: 163_000,
        customerRate: 1636,
      },
    })
    expect(display.youSendAmount).toBe(99.5)
    expect(display.youSendAmount).not.toBe(display.totalDebited)
  })

  it("same-currency bank/momo still applies processing bps before a quote", () => {
    const display = resolveAmountScreenPayoutPreview({
      amountEntryMode: "receive",
      principalSend: 50,
      principalReceive: 50,
      customerRate: 1,
    })
    expect(display.totalDebited).toBeCloseTo(50.5, 2)
    expect(display.youSendAmount).toBe(50)
    expect(display.source).toBe("rate")
  })
})

describe("resolveAmountScreenTlcPreview", () => {
  it("adds bps to local principal before a quote", () => {
    const display = resolveAmountScreenTlcPreview({
      receiveAmount: 50_000,
      principalLocal: 818_000,
      customerRate: 16.36,
    })
    expect(display.principalLocal).toBe(818_000)
    expect(display.localPayIn).toBeGreaterThan(818_000)
    expect(display.source).toBe("rate")
  })

  it("uses quoted localPayIn when receive amount matches", () => {
    const display = resolveAmountScreenTlcPreview({
      receiveAmount: 50_000,
      principalLocal: 818_000,
      customerRate: 16.36,
      quote: {
        localPayIn: 850_123,
        receiveAmount: 50_000,
        customerRate: 16.36,
      },
    })
    expect(display.localPayIn).toBe(850_123)
    expect(display.source).toBe("quote")
    expect(display.feeInclusive).toBe(true)
  })
})

describe("resolveAmountScreenWalletPreview", () => {
  it("applies the 1% processing estimate before a quote", () => {
    const display = resolveAmountScreenWalletPreview({ receiveAmount: 100 })
    expect(display.receiveAmount).toBe(100)
    expect(display.totalDebited).toBeCloseTo(101, 6)
    expect(display.feeInclusive).toBe(true)
    expect(display.source).toBe("rate")
  })

  it("overlays a matching wallet quote", () => {
    const display = resolveAmountScreenWalletPreview({
      receiveAmount: 100,
      quote: { receiveAmount: 100, totalDebited: 101.4, youSendAmount: 100 },
    })
    expect(display.totalDebited).toBe(101.4)
    expect(display.source).toBe("quote")
  })
})
