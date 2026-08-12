/**
 * Lightspark Grid money-transmission receipt disclosures (verbatim) + email detail helpers.
 * @see https://docs.lightspark.com/payouts-and-b2b/payment-flow/receipts
 */

export const GRID_RECEIPT_DISCLOSURES = {
  moneyTransmitter: "Lightspark Payments, LLC",
  nmlsId: "2429193",
  regulatoryAddress: "8605 Santa Monica Blvd, PMB 64461, West Hollywood, CA 90069",
  website: "www.lightspark.com",
  customerServicePhone: "(855) 516-0103",
  fraudReporting:
    "To report fraud or suspected fraud in connection with the money transmission services, please call customer services toll-free at (855) 516-0103.",
  refundPolicyUrl:
    "https://support.lightspark.com/hc/en-us/categories/51347651720859-Cards",
  refundPolicyText:
    "You may cancel for a full refund within 30 minutes of payment, unless the funds have already been picked up or deposited. See the refund policy or call the number above.",
} as const

/** Foreign remittance shortfall disclosure (include only on cross-border payouts). */
export const FOREIGN_REMITTANCE_DISCLOSURE =
  "Recipient may receive less than the total to recipient due to fees charged by the recipient's bank and any foreign taxes."

export type GridReceiptEmailDetailInput = {
  gridTransactionId: string
  easnerTransactionId?: string | null
  senderName?: string | null
  recipientName?: string | null
  transferAmountDisplay?: string | null
  totalToRecipientDisplay?: string | null
  totalTransferFeesDisplay?: string | null
  taxesDisplay?: string | null
  totalDisplay?: string | null
  exchangeRateDisplay?: string | null
  transactionType?: string | null
  settledAtDisplay?: string | null
  includeForeignRemittanceDisclosure?: boolean
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function pushRow(
  rows: { label: string; value: string }[],
  label: string,
  value: string | null | undefined,
): void {
  const v = typeof value === "string" ? value.trim() : ""
  if (!v) return
  rows.push({ label, value: v })
}

/** Detail rows for Grid regulatory receipt emails (no crypto / chain fields). */
export function buildGridReceiptEmailDetailRows(
  input: GridReceiptEmailDetailInput,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  pushRow(rows, "Grid transaction ID", input.gridTransactionId)
  pushRow(rows, "Easner reference", input.easnerTransactionId)
  pushRow(rows, "Sender", input.senderName)
  pushRow(rows, "Recipient", input.recipientName)
  pushRow(rows, "Transaction type", input.transactionType)
  pushRow(rows, "Transfer amount", input.transferAmountDisplay)
  pushRow(rows, "Total to recipient", input.totalToRecipientDisplay)
  pushRow(rows, "Total transfer fees", input.totalTransferFeesDisplay)
  pushRow(rows, "Taxes", input.taxesDisplay)
  pushRow(rows, "Total", input.totalDisplay)
  pushRow(rows, "Exchange rate", input.exchangeRateDisplay)
  pushRow(rows, "When", input.settledAtDisplay)
  return rows
}

/** HTML footer block with verbatim Lightspark disclosures. */
export function renderGridReceiptDisclosureHtml(opts?: {
  includeForeignRemittanceDisclosure?: boolean
}): string {
  const d = GRID_RECEIPT_DISCLOSURES
  const foreign = opts?.includeForeignRemittanceDisclosure
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#6F756F;">${escapeHtml(FOREIGN_REMITTANCE_DISCLOSURE)}</p>`
    : ""
  return `
<div class="grid-receipt-disclosures" style="margin-top:16px;padding-top:12px;border-top:1px solid #E8EBE8;font-size:12px;line-height:1.55;color:#6F756F;">
  <p style="margin:0 0 10px;">${escapeHtml(d.fraudReporting)}</p>
  <p style="margin:0 0 10px;">
    <strong>Refund Policy</strong> -
    ${escapeHtml(d.refundPolicyText)}
    <a href="${escapeHtml(d.refundPolicyUrl)}" style="color:#1B6B3A;">Refund policy</a>
  </p>
  ${foreign}
  <p style="margin:12px 0 0;">
    ${escapeHtml(d.moneyTransmitter)} · NMLS ID ${escapeHtml(d.nmlsId)}<br/>
    ${escapeHtml(d.regulatoryAddress)}<br/>
    ${escapeHtml(d.website)} · ${escapeHtml(d.customerServicePhone)}
  </p>
</div>`.trim()
}
