import type { EffectivePaymentDisplay } from "@/lib/invoices/resolve-payment-display"
import type { InvoicePayInPayload } from "@/lib/invoices/resolve-pay-in-for-business"

/** Strip bank/stablecoin from pay-in payload based on effective display flags. */
export function filterPayInByDisplay(
  payIn: InvoicePayInPayload,
  display: Pick<EffectivePaymentDisplay, "showBank" | "showStablecoin">,
): InvoicePayInPayload {
  const out: InvoicePayInPayload = {}
  if (display.showBank && payIn.bankAccount) {
    out.bankAccount = payIn.bankAccount
  }
  if (display.showStablecoin && payIn.stablecoinAccount) {
    out.stablecoinAccount = payIn.stablecoinAccount
  }
  return out
}
