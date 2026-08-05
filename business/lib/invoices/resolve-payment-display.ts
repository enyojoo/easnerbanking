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

/** Map Settings → Default payment option to the customer invoice tab. */
export function resolveDefaultTabFromPreferredMethod(
  preferredMethod: InvoicePaymentDefaults["preferredMethod"],
  shows: { showBank: boolean; showStablecoin: boolean; showOnlinePayment: boolean },
): "bank" | "stablecoin" | "online" {
  if (preferredMethod === "online" && shows.showOnlinePayment) return "online"
  if (preferredMethod === "stablecoin" && shows.showStablecoin) return "stablecoin"
  if (preferredMethod === "bank" && shows.showBank) return "bank"
  if (shows.showOnlinePayment) return "online"
  if (shows.showBank) return "bank"
  if (shows.showStablecoin) return "stablecoin"
  return "bank"
}

function invoicePaymentShowsMatchBusinessDefaults(
  perInvoice: InvoicePaymentDisplay,
  defaults: InvoicePaymentDefaults,
  stripePlatformEnabled: boolean,
): boolean {
  const bizShowBank = defaults.showBankTransfer !== false
  const bizShowStable = defaults.showStablecoin !== false
  const bizShowOnline = defaults.showOnlinePayment !== false && stripePlatformEnabled

  if (perInvoice.showBank !== undefined && perInvoice.showBank !== bizShowBank) return false
  if (perInvoice.showStablecoin !== undefined && perInvoice.showStablecoin !== bizShowStable) {
    return false
  }
  if (perInvoice.showOnlinePayment !== undefined && perInvoice.showOnlinePayment !== bizShowOnline) {
    return false
  }
  return true
}

function resolvePerInvoiceDefaultTab(
  perInvoice: InvoicePaymentDisplay,
  shows: { showBank: boolean; showStablecoin: boolean; showOnlinePayment: boolean },
): "bank" | "stablecoin" | "online" | null {
  if (perInvoice.defaultTab === "online" && shows.showOnlinePayment) return "online"
  if (perInvoice.defaultTab === "stablecoin" && shows.showStablecoin) return "stablecoin"
  if (perInvoice.defaultTab === "bank" && shows.showBank) return "bank"
  return null
}

/** Resolve effective payment method visibility for an invoice surface. */
export function resolvePaymentDisplay(input: {
  invoice: Pick<Invoice, "paymentDisplay" | "status">
  businessDefaults?: Partial<InvoicePaymentDefaults> | null
  payIn: InvoicePayInPayload
  /** When false, hide all payment methods (e.g. drafts, paid, void). */
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

  let defaultTab = resolveDefaultTabFromPreferredMethod(defaults.preferredMethod, {
    showBank,
    showStablecoin,
    showOnlinePayment,
  })

  if (
    perInvoice?.defaultTab != null &&
    !invoicePaymentShowsMatchBusinessDefaults(
      perInvoice,
      defaults,
      input.stripeOnlineEnabled === true,
    )
  ) {
    const perInvoiceTab = resolvePerInvoiceDefaultTab(perInvoice, {
      showBank,
      showStablecoin,
      showOnlinePayment,
    })
    if (perInvoiceTab) defaultTab = perInvoiceTab
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
