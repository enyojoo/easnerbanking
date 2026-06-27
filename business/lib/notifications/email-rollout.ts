/** Ledger transaction emails are on by default; set LEDGER_TRANSACTION_EMAIL_ENABLED=false to disable. */
export function isLedgerTransactionEmailEnabled(): boolean {
  const raw = String(process.env.LEDGER_TRANSACTION_EMAIL_ENABLED ?? "").trim().toLowerCase()
  if (raw === "false" || raw === "0" || raw === "off" || raw === "no") return false
  return true
}
