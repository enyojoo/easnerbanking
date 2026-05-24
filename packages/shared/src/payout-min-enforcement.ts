import { convertNoahSendFlowAmounts } from "./noah-send-rates"

export const PAYOUT_MIN_ENFORCE_DEBOUNCE_MS = 3000

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
  if (input.useManualQuote && input.manualQuote) {
    return input.manualQuote.receiveAmount
  }
  if (input.amountEntryMode === "receive") {
    return input.enteredAmount
  }
  return convertNoahSendFlowAmounts({
    direction: "send",
    amount: input.enteredAmount,
    sendCurrency: input.sendCurrency,
    receiveCurrency: input.receiveCurrency,
    rateMap: input.rateMap,
  }).receiveAmount
}

/** Entered amount (send or receive mode) that yields at least `minReceive` on the recipient side. */
export function computeEnteredAmountForReceiveMin(input: {
  minReceive: number
  amountEntryMode: "send" | "receive"
  sendCurrency: string
  receiveCurrency: string
  rateMap: Record<string, number>
}): number {
  if (input.amountEntryMode === "receive") {
    return input.minReceive
  }
  return convertNoahSendFlowAmounts({
    direction: "receive",
    amount: input.minReceive,
    sendCurrency: input.sendCurrency,
    receiveCurrency: input.receiveCurrency,
    rateMap: input.rateMap,
  }).sendAmount
}
