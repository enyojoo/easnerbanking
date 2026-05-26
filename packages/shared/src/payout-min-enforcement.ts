import {
  convertNoahSendFlowAmounts,
  normalizePayoutReceiveAmountForCurrency,
  normalizePayoutSendAmount,
} from "./noah-send-rates"

export const PAYOUT_MIN_ENFORCE_DEBOUNCE_MS = 3000

const MAX_SEND_BUMP_ITERATIONS = 5000

function normalizedReceiveFromSend(input: {
  sendAmount: number
  sendCurrency: string
  receiveCurrency: string
  rateMap: Record<string, number>
}): number {
  if (input.sendAmount <= 0) return 0
  const { receiveAmount } = convertNoahSendFlowAmounts({
    direction: "send",
    amount: input.sendAmount,
    sendCurrency: input.sendCurrency,
    receiveCurrency: input.receiveCurrency,
    rateMap: input.rateMap,
  })
  return normalizePayoutReceiveAmountForCurrency(input.receiveCurrency, receiveAmount)
}

/** Implied receive for the active amount box (normalized per payout currency). */
export function computePayoutReceiveAmount(input: {
  amountEntryMode: "send" | "receive"
  enteredAmount: number
  sendCurrency: string
  receiveCurrency: string
  rateMap: Record<string, number>
  manualQuote?: { sendAmount: number; receiveAmount: number } | null
  useManualQuote?: boolean
}): number {
  if (input.enteredAmount <= 0) return 0
  if (input.useManualQuote && input.manualQuote && input.manualQuote.receiveAmount > 0) {
    if (input.amountEntryMode === "receive") {
      return normalizePayoutReceiveAmountForCurrency(
        input.receiveCurrency,
        input.enteredAmount,
      )
    }
    const scale = input.manualQuote.sendAmount > 0 ? input.enteredAmount / input.manualQuote.sendAmount : 0
    return normalizePayoutReceiveAmountForCurrency(
      input.receiveCurrency,
      input.manualQuote.receiveAmount * scale,
    )
  }
  if (input.amountEntryMode === "receive") {
    return normalizePayoutReceiveAmountForCurrency(input.receiveCurrency, input.enteredAmount)
  }
  return normalizedReceiveFromSend({
    sendAmount: input.enteredAmount,
    sendCurrency: input.sendCurrency,
    receiveCurrency: input.receiveCurrency,
    rateMap: input.rateMap,
  })
}

/** True when implied receive is at or above the policy minimum. */
export function payoutReceiveMeetsMin(input: {
  receiveAmount: number
  minReceive: number
  receiveCurrency: string
}): boolean {
  const min = normalizePayoutReceiveAmountForCurrency(
    input.receiveCurrency,
    input.minReceive,
  )
  const receive = normalizePayoutReceiveAmountForCurrency(
    input.receiveCurrency,
    input.receiveAmount,
  )
  return receive > 0 && receive >= min
}

/**
 * Entered amount for the active box so normalized receive is at least `minReceive`.
 * In send mode, bumps send in 0.01 steps when FX rounding would otherwise land below min.
 */
export function computeEnteredAmountForReceiveMin(input: {
  minReceive: number
  amountEntryMode: "send" | "receive"
  sendCurrency: string
  receiveCurrency: string
  rateMap: Record<string, number>
  manualQuote?: { sendAmount: number; receiveAmount: number } | null
  useManualQuote?: boolean
}): number {
  const minReceive = normalizePayoutReceiveAmountForCurrency(
    input.receiveCurrency,
    input.minReceive,
  )
  if (minReceive <= 0) return 0

  if (input.amountEntryMode === "receive") {
    return minReceive
  }

  if (
    input.useManualQuote &&
    input.manualQuote &&
    input.manualQuote.receiveAmount > 0 &&
    input.manualQuote.sendAmount > 0
  ) {
    const scale = minReceive / input.manualQuote.receiveAmount
    return normalizePayoutSendAmount(input.manualQuote.sendAmount * scale)
  }

  let sendAmount = convertNoahSendFlowAmounts({
    direction: "receive",
    amount: minReceive,
    sendCurrency: input.sendCurrency,
    receiveCurrency: input.receiveCurrency,
    rateMap: input.rateMap,
  }).sendAmount

  if (sendAmount <= 0) return 0

  let iterations = 0
  while (iterations < MAX_SEND_BUMP_ITERATIONS) {
    const receive = normalizedReceiveFromSend({
      sendAmount,
      sendCurrency: input.sendCurrency,
      receiveCurrency: input.receiveCurrency,
      rateMap: input.rateMap,
    })
    if (receive >= minReceive) {
      return sendAmount
    }
    sendAmount = normalizePayoutSendAmount(sendAmount + 0.01)
    iterations += 1
  }

  return sendAmount
}
