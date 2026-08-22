import {
  isStripeOnrampPayerEligible,
  type StripeOnrampPayerGeoInput,
} from "@easner/shared"
import { isStripeOnrampEnabled, isStripeOnrampEuEnabled } from "./onramp-config"

export function stripeOnrampOfficeFlags() {
  return {
    stripeOnrampEnabled: isStripeOnrampEnabled(),
    stripeOnrampEuEnabled: isStripeOnrampEuEnabled(),
  }
}

export function isExpressDepositsPayerEligible(
  input: Omit<StripeOnrampPayerGeoInput, "euEnabled">,
): boolean {
  if (!isStripeOnrampEnabled()) return false
  return isStripeOnrampPayerEligible({
    ...input,
    euEnabled: isStripeOnrampEuEnabled(),
  })
}
