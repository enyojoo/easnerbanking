import { describe, expect, it } from "vitest"
import { buildRecipientSnapshotFromRow, normalizePayoutReviewSnapshot } from "./build-payout-execute-snapshot"

describe("normalizePayoutReviewSnapshot", () => {
  it("preserves display_processing_fee_local for cross-border pay-in", () => {
    const review = normalizePayoutReviewSnapshot({
      you_send_amount: 94606.3,
      total_debited: 94606.3,
      receive_amount: 988500,
      receive_currency: "NGN",
      send_currency: "KES",
      transfer_method: "Local Transfer",
      exchange_rate: 10.715354715212,
      processing_fee: 7.207657,
      exchange_fee: 14.8,
      processing_time: "Within minutes",
      display_processing_fee_local: 2830.91,
    })

    expect(review?.display_processing_fee_local).toBe(2830.91)
  })

  it("preserves principal_local_pay_in for cross-border pay-in", () => {
    const review = normalizePayoutReviewSnapshot({
      you_send_amount: 94_606.3,
      total_debited: 94_606.3,
      receive_amount: 988_500,
      receive_currency: "NGN",
      send_currency: "KES",
      transfer_method: "Local Transfer",
      exchange_rate: 10.715354715212,
      processing_fee: 7.207657,
      exchange_fee: 14.8,
      processing_time: "Within minutes",
      display_processing_fee_local: 2830.91,
      principal_local_pay_in: 92_250.8,
    })

    expect(review?.principal_local_pay_in).toBe(92_250.8)
  })
})

describe("buildRecipientSnapshotFromRow", () => {
  it("includes US transfer_type so ACH and RTP cannot share a lock", () => {
    const row = {
      full_name: "Jane Doe",
      account_number: "123456789",
      bank_name: "Chase",
      currency: "USD",
      country_code: "US",
      transfer_type: "RTP" as const,
    }
    expect(buildRecipientSnapshotFromRow(row).transfer_type).toBe("RTP")
    expect(buildRecipientSnapshotFromRow({ ...row, transfer_type: "ACH" }).transfer_type).toBe(
      "ACH",
    )
  })
})

