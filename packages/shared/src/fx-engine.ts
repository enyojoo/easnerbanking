import type { ExchangeRate } from "./types"

export interface OrderAmounts {
  sendAmount: number
  receiveAmount: number
  exchangeRate: number
  feeAmount: number
  feeType: string
  totalAmount: number
}

/**
 * Pure FX calculation for catalog / send flows.
 * Does not fetch rates – callers pass `exchangeRates[]`.
 * Production Noah wallet send may still use Noah APIs until wired here.
 */
export const fxEngine = {
  getRate(
    exchangeRates: ExchangeRate[],
    fromCurrency: string,
    toCurrency: string,
  ): ExchangeRate | null {
    const from = fromCurrency.trim().toUpperCase()
    const to = toCurrency.trim().toUpperCase()

    if (from === to) {
      return {
        id: "",
        from_currency: from,
        to_currency: to,
        rate: 1,
        fee_type: "free",
        fee_amount: 0,
        status: "active",
        created_at: "",
        updated_at: "",
      }
    }

    const directRate = exchangeRates.find(
      (r) =>
        r.from_currency === from &&
        r.to_currency === to &&
        r.status === "active",
    )
    if (directRate) return directRate

    const reverseRate = exchangeRates.find(
      (r) =>
        r.from_currency === to &&
        r.to_currency === from &&
        r.status === "active",
    )
    if (reverseRate && reverseRate.rate > 0) {
      return {
        ...reverseRate,
        from_currency: from,
        to_currency: to,
        rate: 1 / reverseRate.rate,
        fee_type: reverseRate.fee_type,
        fee_amount: reverseRate.fee_amount,
      }
    }

    return null
  },

  calculateFee(amount: number, rateData: ExchangeRate): number {
    if (!rateData || rateData.fee_type === "free") {
      return 0
    }

    if (rateData.fee_type === "fixed") {
      return rateData.fee_amount
    }

    if (rateData.fee_type === "percentage") {
      return (amount * rateData.fee_amount) / 100
    }

    return 0
  },

  calculateOrderAmounts(input: {
    direction: "receive" | "send"
    amount: number
    fromCurrency: string
    toCurrency: string
    exchangeRates: ExchangeRate[]
  }): OrderAmounts {
    const { direction, amount, fromCurrency, toCurrency, exchangeRates } = input

    if (amount <= 0) {
      throw new Error("Amount must be greater than 0")
    }

    if (!fromCurrency || !toCurrency) {
      throw new Error("Both fromCurrency and toCurrency are required")
    }

    const rateData = this.getRate(exchangeRates, fromCurrency, toCurrency)
    if (!rateData) {
      throw new Error(
        `Exchange rate not found for ${fromCurrency} to ${toCurrency}`,
      )
    }

    let sendAmount: number
    let receiveAmount: number

    if (direction === "receive") {
      receiveAmount = amount
      sendAmount = receiveAmount / rateData.rate
    } else {
      sendAmount = amount
      receiveAmount = sendAmount * rateData.rate
    }

    const feeAmount = this.calculateFee(sendAmount, rateData)
    const totalAmount = sendAmount + feeAmount

    return {
      sendAmount: Math.round(sendAmount * 100) / 100,
      receiveAmount: Math.round(receiveAmount * 100) / 100,
      exchangeRate: rateData.rate,
      feeAmount: Math.round(feeAmount * 100) / 100,
      feeType: rateData.fee_type,
      totalAmount: Math.round(totalAmount * 100) / 100,
    }
  },

  validateRate(
    exchangeRates: ExchangeRate[],
    fromCurrency: string,
    toCurrency: string,
  ): boolean {
    return this.getRate(exchangeRates, fromCurrency, toCurrency) !== null
  },
}
