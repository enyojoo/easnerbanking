import type { RefObject } from 'react'
import type { View } from 'react-native'
import * as Print from 'expo-print'
import type { ReceiptDetails } from '../components/receipt/receipt-types'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function recipientHtml(rows: ReceiptDetails['rows']): string {
  const recipient = rows.find((r) => r.label === 'Recipient')
  if (!recipient) return ''
  const match = recipient.value.match(/^(.+?) \((.+)\)$/)
  if (match) {
    return `<div class="row"><span class="label">Recipient</span><span class="value">${escapeHtml(match[1])}<br/><span class="sub">(${escapeHtml(match[2])})</span></span></div>`
  }
  return `<div class="row"><span class="label">Recipient</span><span class="value">${escapeHtml(recipient.value)}</span></div>`
}

function buildReceiptHtml(receipt: ReceiptDetails): string {
  const rows = receipt.rows
    .filter((r) => r.label !== 'Recipient')
    .map(
      (r) =>
        `<div class="row"><span class="label">${escapeHtml(r.label)}</span><span class="value">${escapeHtml(r.value)}</span></div>`,
    )
    .join('')
  const statusColor = receipt.outcome === 'success' ? '#16a34a' : '#dc2626'
  const amountColor = receipt.isCredit ? '#007ACC' : '#111827'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 32px; color: #111827; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .brand { font-size: 22px; font-weight: 700; color: #007ACC; }
  .doc-title { font-size: 12px; color: #6b7280; }
  .hero { text-align: center; margin-bottom: 24px; }
  .amount { font-size: 32px; font-weight: 700; color: ${amountColor}; margin: 12px 0 8px; }
  .title { font-size: 15px; color: #4b5563; margin-bottom: 8px; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; color: ${statusColor}; background: ${receipt.outcome === 'success' ? '#dcfce7' : '#fee2e2'}; }
  .date { font-size: 13px; color: #9ca3af; margin-top: 8px; }
  .divider { border-top: 1px solid #e5e7eb; margin: 20px 0; }
  .row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 12px; font-size: 14px; }
  .label { color: #6b7280; flex-shrink: 0; }
  .value { text-align: right; font-weight: 600; max-width: 60%; }
  .sub { font-weight: 500; color: #6b7280; font-size: 13px; }
  .id { font-size: 12px; font-family: ui-monospace, monospace; }
  .footer { margin-top: 28px; text-align: center; font-size: 12px; color: #9ca3af; line-height: 1.5; }
  .footer a { color: #007ACC; text-decoration: none; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">Easner</div>
    <div class="doc-title">Transaction Receipt</div>
  </div>
  <div class="hero">
    <div class="amount">${escapeHtml(receipt.amountText)}</div>
    ${receipt.title ? `<div class="title">${escapeHtml(receipt.title)}</div>` : ''}
    <div class="status">${escapeHtml(receipt.statusLabel)}</div>
    <div class="date">${escapeHtml(receipt.dateText)}</div>
  </div>
  <div class="divider"></div>
  ${recipientHtml(receipt.rows)}
  ${rows}
  <div class="divider"></div>
  <div class="row"><span class="label">Transaction ID</span><span class="value id">${escapeHtml(receipt.transactionId)}</span></div>
  <div class="footer">
    <div>For complaints regarding this transaction,</div>
    <div>please contact our support: <a href="mailto:support@easner.com">support@easner.com</a></div>
  </div>
</body>
</html>`
}

/**
 * iOS: no view-shot / custom snapshot pods — they crash at launch on New Arch.
 * Render receipt data to a shareable PDF via expo-print (lazy-loaded when user taps Save/Share).
 */
export async function captureReceiptImage(
  _ref: RefObject<View | null>,
  receipt: ReceiptDetails | null,
): Promise<string> {
  if (!receipt) throw new Error('Receipt is not ready yet.')
  const { uri } = await Print.printToFileAsync({ html: buildReceiptHtml(receipt) })
  return uri
}
