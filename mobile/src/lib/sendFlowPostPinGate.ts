/** After PIN verification on SendPin, Confirm runs the balance send + navigation (business-parity flow). */

let balanceSendPinVerified = false

export function markBalanceSendPinVerified(): void {
  balanceSendPinVerified = true
}

export function consumeBalanceSendPinVerified(): boolean {
  const v = balanceSendPinVerified
  balanceSendPinVerified = false
  return v
}
