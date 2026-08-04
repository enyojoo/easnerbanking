export type StripeSettlementPhase =
  | "payment_received"
  | "payout_sent"
  | "credited"
  | "failed"

export type StripeSettlementRail = "grid_va" | "turnkey_stablecoin"

export type InvoiceCheckoutSessionStatus = "open" | "complete" | "expired" | "failed"
