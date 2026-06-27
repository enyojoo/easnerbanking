/** Ledger transaction emails require explicit opt-in (default off). */
export function isLedgerTransactionEmailEnabled(): boolean {
  return String(process.env.LEDGER_TRANSACTION_EMAIL_ENABLED || "").trim().toLowerCase() === "true"
}
