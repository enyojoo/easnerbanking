import {
  formatDisplayPersonName,
  getGlobalPayoutProcessingTime,
  getGlobalPayoutTransferMethod,
  isPayoutReviewFeeVisible,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
} from "@easner/shared"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

export type { GlobalPayoutRecipientSnapshot, GlobalPayoutReviewSnapshot }

export function buildRecipientSnapshotFromRow(
  row: RecipientSellPrepareRow,
): GlobalPayoutRecipientSnapshot {
  const fullName = formatDisplayPersonName(row.full_name) || String(row.full_name || "").trim()
  const accountNumber = String(row.account_number || row.iban || "").trim()
  const phone = String(row.phone_number || "").trim()
  return {
    full_name: fullName,
    ...(row.bank_name?.trim() ? { bank_name: row.bank_name.trim() } : {}),
    ...(accountNumber ? { account_number: accountNumber } : {}),
    ...(phone ? { phone } : {}),
    ...(row.mobile_provider?.trim() ? { mobile_provider: row.mobile_provider.trim() } : {}),
    ...(row.country_code?.trim()
      ? { country_code: row.country_code.trim().toUpperCase() }
      : {}),
    ...(row.currency?.trim() ? { currency: row.currency.trim().toUpperCase() } : {}),
    ...(row.transfer_type?.trim() ? { transfer_type: row.transfer_type.trim() } : {}),
  }
}

export function normalizePayoutReviewSnapshot(
  raw: unknown,
): GlobalPayoutReviewSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const receiveAmount = Number(o.receive_amount)
  const totalDebited = Number(o.total_debited)
  const youSend = Number(o.you_send_amount)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return null
  if (!Number.isFinite(totalDebited) || totalDebited <= 0) return null
  const transferMethod = String(o.transfer_method || getGlobalPayoutTransferMethod({})).trim()
  return {
    you_send_amount: Number.isFinite(youSend) ? youSend : totalDebited,
    total_debited: totalDebited,
    exchange_fee: Number.isFinite(Number(o.exchange_fee)) ? Number(o.exchange_fee) : 0,
    processing_fee: Number.isFinite(Number(o.processing_fee)) ? Number(o.processing_fee) : 0,
    exchange_rate: Number.isFinite(Number(o.exchange_rate)) ? Number(o.exchange_rate) : 1,
    send_currency: String(o.send_currency || "USD").toUpperCase(),
    receive_amount: receiveAmount,
    ...(Number.isFinite(Number(o.requested_receive_amount)) &&
    Number(o.requested_receive_amount) > 0
      ? { requested_receive_amount: Number(o.requested_receive_amount) }
      : {}),
    receive_currency: String(o.receive_currency || "USD").toUpperCase(),
    transfer_method: transferMethod,
    processing_time: String(
      o.processing_time || getGlobalPayoutProcessingTime(transferMethod),
    ).trim(),
    ...(Number.isFinite(Number(o.margin_amount)) ? { margin_amount: Number(o.margin_amount) } : {}),
    ...(Number.isFinite(Number(o.easner_fee)) ? { easner_fee: Number(o.easner_fee) } : {}),
    ...(Number.isFinite(Number(o.noah_floor)) ? { noah_floor: Number(o.noah_floor) } : {}),
    ...(Number.isFinite(Number(o.noah_send_amount))
      ? { noah_send_amount: Number(o.noah_send_amount) }
      : {}),
    ...(Number.isFinite(Number(o.yc_floor)) ? { yc_floor: Number(o.yc_floor) } : {}),
    ...(Number.isFinite(Number(o.yc_send_amount))
      ? { yc_send_amount: Number(o.yc_send_amount) }
      : {}),
    ...(Number.isFinite(Number(o.channel_cost)) ? { channel_cost: Number(o.channel_cost) } : {}),
    ...(Number.isFinite(Number(o.noah_schedule_fee))
      ? { noah_schedule_fee: Number(o.noah_schedule_fee) }
      : {}),
    ...(Number.isFinite(Number(o.noah_channel_fee))
      ? { noah_channel_fee: Number(o.noah_channel_fee) }
      : {}),
    ...(Number.isFinite(Number(o.quote_noah_mid)) ? { quote_noah_mid: Number(o.quote_noah_mid) } : {}),
    ...(o.execution_model === "direct_turnkey" || o.execution_model === "relay_bridge"
      ? { execution_model: o.execution_model }
      : {}),
    ...(Number.isFinite(Number(o.display_processing_fee_local)) &&
    isPayoutReviewFeeVisible(Number(o.display_processing_fee_local))
      ? { display_processing_fee_local: Number(o.display_processing_fee_local) }
      : {}),
    ...(Number.isFinite(Number(o.principal_local_pay_in)) &&
    Number(o.principal_local_pay_in) > 0
      ? { principal_local_pay_in: Number(o.principal_local_pay_in) }
      : {}),
  }
}
