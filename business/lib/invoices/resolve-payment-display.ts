import type { Invoice, InvoicePaymentDisplay, InvoicePaymentDefaults } from "@/lib/b2b/types"
import type { InvoicePayInPayload } from "@/lib/invoices/resolve-pay-in-for-business"
import { DEFAULT_INVOICE_PAYMENT_DEFAULTS } from "@/lib/invoices/invoice-settings"

export type EffectivePaymentDisplay = {
  showBank: boolean
  showStablecoin: boolean
  showOnlinePayment: boolean
  defaultTab: "bank" | "stablecoin" | "online"
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
  /** Platform Stripe Pay online is configured and enabled. */
  stripeOnlineEnabled?: boolean
  /**
   * When Stripe Connect is required, pass whether this business is Connect-ready.
   * When omitted / undefined, treated as true (legacy platform-only path).
   */
  stripeConnectReady?: boolean
}): EffectivePaymentDisplay {
  const defaults = {
    ...DEFAULT_INVOICE_PAYMENT_DEFAULTS,
    ...input.businessDefaults,
  }

  const perInvoice = input.invoice.paymentDisplay
  const hasBank = bankProvisioned(input.payIn)
  const hasStable = stablecoinProvisioned(input.payIn)
  const payable = input.payable ?? true
  const stripeOnlineEnabled =
    input.stripeOnlineEnabled === true && input.stripeConnectReady !== false

  if (!payable) {
    return {
      showBank: false,
      showStablecoin: false,
      showOnlinePayment: false,
      defaultTab: "bank",
      includePaymentOnPdf: false,
      includePaymentInEmail: false,
    }
  }

  let showBank = defaults.showBankTransfer && hasBank
  let showStablecoin = defaults.showStablecoin && hasStable
  let showOnlinePayment = defaults.showOnlinePayment !== false && stripeOnlineEnabled

  if (perInvoice) {
    if (perInvoice.showBank === false) showBank = false
    if (perInvoice.showStablecoin === false) showStablecoin = false
    if (perInvoice.showOnlinePayment === false) showOnlinePayment = false
    if (perInvoice.showBank === true && hasBank) showBank = true
    if (perInvoice.showStablecoin === true && hasStable) showStablecoin = true
    if (perInvoice.showOnlinePayment === true && stripeOnlineEnabled) showOnlinePayment = true
  }

  if (!showBank && !showStablecoin && !showOnlinePayment && (hasBank || hasStable)) {
    if (hasBank) showBank = true
    else if (hasStable) showStablecoin = true
  }

  let defaultTab: "bank" | "stablecoin" | "online" = "bank"
  if (perInvoice?.defaultTab === "online" && showOnlinePayment) {
    defaultTab = "online"
  } else if (perInvoice?.defaultTab === "stablecoin" && showStablecoin) {
    defaultTab = "stablecoin"
  } else if (perInvoice?.defaultTab === "bank" && showBank) {
    defaultTab = "bank"
  } else if (defaults.preferredMethod === "online" && showOnlinePayment) {
    defaultTab = "online"
  } else if (defaults.preferredMethod === "stablecoin" && showStablecoin) {
    defaultTab = "stablecoin"
  } else if (defaults.preferredMethod === "bank" && showBank) {
    defaultTab = "bank"
  } else if (showOnlinePayment) {
    defaultTab = "online"
  } else if (showStablecoin && !showBank) {
    defaultTab = "stablecoin"
  }

  return {
    showBank,
    showStablecoin,
    showOnlinePayment,
    defaultTab,
    includePaymentOnPdf: defaults.includePaymentOnPdf,
    includePaymentInEmail: defaults.includePaymentInEmail,
  }
}

export function defaultPaymentDisplayFromForm(input: {
  showBank: boolean
  showStablecoin: boolean
  showOnlinePayment?: boolean
  defaultTab?: "bank" | "stablecoin" | "online"
}): InvoicePaymentDisplay {
  return {
    showBank: input.showBank,
    showStablecoin: input.showStablecoin,
    showOnlinePayment: input.showOnlinePayment,
    defaultTab: input.defaultTab,
  }
}
