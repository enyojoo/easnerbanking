import type { Invoice, InvoicePaymentDisplay, InvoicePaymentDefaults } from "@/lib/b2b/types"
import type { InvoicePayInPayload } from "@/lib/invoices/resolve-pay-in-for-business"
import { DEFAULT_INVOICE_PAYMENT_DEFAULTS } from "@/lib/invoices/invoice-settings"

export type EffectivePaymentDisplay = {
  showBank: boolean
  showStablecoin: boolean
  defaultTab: "bank" | "stablecoin"
  includePaymentOnPdf: boolean
  includePaymentInEmail: boolean
}

function bankProvisioned(payIn: InvoicePayInPayload): boolean {
  return Boolean(payIn.bankAccount)
}

function stablecoinProvisioned(payIn: InvoicePayInPayload): boolean {
  return Boolean(payIn.stablecoinAccount)
}

/** Resolve effective payment method visibility for an invoice surface. */
export function resolvePaymentDisplay(input: {
  invoice: Pick<Invoice, "paymentDisplay" | "status">
  businessDefaults?: Partial<InvoicePaymentDefaults> | null
  payIn: InvoicePayInPayload
  /** When false, hide all payment methods (e.g. quotes, drafts). */
  payable?: boolean
}): EffectivePaymentDisplay {
  const defaults = {
    ...DEFAULT_INVOICE_PAYMENT_DEFAULTS,
    ...input.businessDefaults,
  }

  const perInvoice = input.invoice.paymentDisplay
  const hasBank = bankProvisioned(input.payIn)
  const hasStable = stablecoinProvisioned(input.payIn)
  const payable = input.payable ?? true

  if (!payable) {
    return {
      showBank: false,
      showStablecoin: false,
      defaultTab: "bank",
      includePaymentOnPdf: false,
      includePaymentInEmail: false,
    }
  }

  let showBank = defaults.showBankTransfer && hasBank
  let showStablecoin = defaults.showStablecoin && hasStable

  if (perInvoice) {
    if (perInvoice.showBank === false) showBank = false
    if (perInvoice.showStablecoin === false) showStablecoin = false
    if (perInvoice.showBank === true && hasBank) showBank = true
    if (perInvoice.showStablecoin === true && hasStable) showStablecoin = true
  }

  if (!showBank && !showStablecoin && (hasBank || hasStable)) {
    if (hasBank) showBank = true
    else if (hasStable) showStablecoin = true
  }

  let defaultTab: "bank" | "stablecoin" = "bank"
  if (perInvoice?.defaultTab === "stablecoin" && showStablecoin) {
    defaultTab = "stablecoin"
  } else if (perInvoice?.defaultTab === "bank" && showBank) {
    defaultTab = "bank"
  } else if (defaults.preferredMethod === "stablecoin" && showStablecoin) {
    defaultTab = "stablecoin"
  } else if (defaults.preferredMethod === "bank" && showBank) {
    defaultTab = "bank"
  } else if (showStablecoin && !showBank) {
    defaultTab = "stablecoin"
  }

  return {
    showBank,
    showStablecoin,
    defaultTab,
    includePaymentOnPdf: defaults.includePaymentOnPdf,
    includePaymentInEmail: defaults.includePaymentInEmail,
  }
}

export function defaultPaymentDisplayFromForm(input: {
  showBank: boolean
  showStablecoin: boolean
  defaultTab?: "bank" | "stablecoin"
}): InvoicePaymentDisplay {
  return {
    showBank: input.showBank,
    showStablecoin: input.showStablecoin,
    defaultTab: input.defaultTab,
  }
}
